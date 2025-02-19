import requests

# Specify the image path here
image_path = r"C:\Users\ML\Desktop\A-Eye-Web-Chat-Assistant\testpic.png"  # Raw string to handle backslashes

# Make a GET request to the /analyze endpoint with the image path
url = "http://localhost:8000/analyze"
params = {"image_path": image_path, "prompt": "Describe this image"}
response = requests.get(url, params=params)

print(response.json())