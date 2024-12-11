from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pydantic import BaseModel
from transformers import pipeline

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the model
generator = pipeline('text-generation', model='distilgpt2')

class Query(BaseModel):
    text: str

@app.post("/process")
async def process_text(query: Query):
    try:
        # Generate response using the model
        response = generator(query.text, max_length=100, num_return_sequences=1)
        return {"response": response[0]['generated_text']}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
