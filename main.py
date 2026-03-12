import os
import json
import chromadb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

CHROMA_PATH = "./chroma_db"
COLLECTION_NAME = "furniture_guide"
EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL = "gpt-4.1"
TOP_K = 8  # retrieve all chunks (PDF only has 8)

app = FastAPI(title="Furniture Guide RAG")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Init clients ---
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"), timeout=30.0)

chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
collection = chroma_client.get_collection(name=COLLECTION_NAME)

# --- Static frontend ---
app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
def serve_frontend():
    return FileResponse("frontend/index.html")


# --- Models ---
class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []  # [{"role": "user"|"assistant", "content": "..."}]


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]


# --- RAG endpoint (streaming) ---
@app.post("/chat")
def chat(req: ChatRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    # 1. Embed the question
    embedding_response = openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=req.question
    )
    query_embedding = embedding_response.data[0].embedding

    # 2. Retrieve top-k relevant chunks
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=TOP_K,
        include=["documents", "distances"]
    )

    retrieved_docs = results["documents"][0]

    # Use all retrieved docs (small PDF - all chunks are relevant)
    context = "\n\n---\n\n".join(retrieved_docs)

    # 3. Build messages
    system_prompt = (
        "You are an expert furniture consultant with deep knowledge of the Furniture Guide. "
        "Answer the user's question using ONLY the provided context from the guide. "
        "If the answer is not found in the context, say so honestly. "
        "Be helpful, clear, and concise. Use bullet points or numbered lists where appropriate."
    )

    messages = [{"role": "system", "content": system_prompt}]

    for turn in req.history[-6:]:
        messages.append({"role": turn["role"], "content": turn["content"]})

    messages.append({
        "role": "user",
        "content": (
            f"Context from the Furniture Guide:\n\n{context}\n\n"
            f"Question: {req.question}"
        )
    })

    # 4. Stream from GPT-4.1
    def generate():
        stream = openai_client.chat.completions.create(
            model=CHAT_MODEL,
            messages=messages,
            temperature=0.2,
            max_tokens=1024,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield f"data: {json.dumps({'token': delta})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/health")
def health():
    return {"status": "ok", "collection": COLLECTION_NAME, "model": CHAT_MODEL}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
