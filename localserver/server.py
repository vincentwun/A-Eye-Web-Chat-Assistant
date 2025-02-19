import os
import io
from PIL import Image
import torch
from transformers import AutoProcessor, AutoModelForImageTextToText
import uvicorn
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
import numpy as np

app = FastAPI()

MODEL_DIR = os.path.abspath("./paligemma2")


@torch.inference_mode()
def load_model():
    processor = AutoProcessor.from_pretrained(MODEL_DIR)
    model = AutoModelForImageTextToText.from_pretrained(
        MODEL_DIR,
        torch_dtype=torch.float16,
        use_safetensors=True,
        device_map="auto"
    )
    return processor, model


processor, model = load_model()


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/")
async def read_root():
    return {"message": "Welcome to the Image Analysis API"}


@app.get("/analyze")
async def analyze_image(image_path: str = Query(...), prompt: str = Query("Describe this image in detail")):
    try:
        # Read the image from the specified path
        image = Image.open(image_path).convert("RGB")

        image_np = np.array(image)

        if image_np.shape[-1] == 3:
            image_np = image_np.transpose((2, 0, 1))
        else:
            print("Image not in HWC format")

        image_np = image_np / 255.0

        # Add <image> token to the prompt
        prompt_with_image_token = "<image> " + prompt

        inputs = processor(
            images=image,
            text=prompt_with_image_token,
            return_tensors="pt"
        ).to(device=model.device)

        outputs = model.generate(
            **inputs,
            max_length=2000,
            num_beams=5,
            temperature=0.8,
        )

        response = processor.batch_decode(outputs, skip_special_tokens=True)[0]

        return JSONResponse({
            "success": True,
            "analysis": response,
            "error": None
        })

    except Exception as e:
        return JSONResponse({
            "success": False,
            "analysis": None,
            "error": str(e)
        })


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)