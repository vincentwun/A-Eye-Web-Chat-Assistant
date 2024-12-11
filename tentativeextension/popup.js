document.getElementById('submit').addEventListener('click', async () => {
  const prompt = document.getElementById('prompt').value;
  const responseDiv = document.getElementById('response');
  
  try {
    const response = await fetch('http://127.0.0.1:8000/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: prompt })
    });
    
    const data = await response.json();
    responseDiv.textContent = data.response;
  } catch (error) {
    responseDiv.textContent = `Error: ${error.message}`;
  }
});
