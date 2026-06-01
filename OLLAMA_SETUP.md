# Ollama Local Model Setup

## Overview
The application has been updated to use **local Ollama models** instead of Claude API. This eliminates the need for API keys and allows offline content generation.

## Prerequisites
- Ollama v0.24.0 (confirmed installed: `ollama version is 0.24.0`)
- Backend running on `http://localhost:8000`
- Frontend running (default: `http://localhost:3000`)

## Configuration

### Backend (`backend/main.py`)
- New endpoint: **`POST /api/generate-content`**
- Calls Ollama service at: `http://localhost:11434`
- Default model: `llama2` (change in main.py if using different model)

### Frontend (`frontend/components/ContentGenerator.tsx`)
- Removed direct Claude API calls
- Now calls backend endpoint: `http://localhost:8000/api/generate-content`
- No API keys required

## Running Ollama

### Start Ollama Service
```bash
ollama serve
```

This starts the Ollama server at `http://localhost:11434` by default.

### Pull a Model
Available models:
- **llama2** (default, 3.8GB) - Good for general purpose
  ```bash
  ollama pull llama2
  ```
- **mistral** (4.1GB) - Faster, good quality
  ```bash
  ollama pull mistral
  ```
- **neural-chat** (4.1GB) - Optimized for conversations
  ```bash
  ollama pull neural-chat
  ```

### List Available Models
```bash
ollama list
```

## Changing the Model

Edit `backend/main.py` in the `/api/generate-content` endpoint:

```python
json={
    "model": "llama2",  # Change this to your model name
    "prompt": prompt,
    ...
}
```

## Running the Application

### Terminal 1: Backend
```bash
cd backend
python main.py
```
Or with uvicorn:
```bash
cd backend
uvicorn main:app --reload --port 8000
```

### Terminal 2: Ollama Service
```bash
ollama serve
```

### Terminal 3: Frontend
```bash
cd frontend
npm run dev
```

## Expected Behavior

1. Navigate to TOC Editor and upload a PDF or add content manually
2. Click on "Content Generator" tab
3. Select a section and add reference text
4. Click "Generate" button
5. The backend will:
   - Receive the request
   - Call the local Ollama model
   - Return generated content
6. Content is added to the chat history and can be used to compile the final document

## Troubleshooting

### Error: "Ollama service not running"
- Make sure Ollama is running: `ollama serve`
- Check if it's accessible: `curl http://localhost:11434/api/tags`

### Error: "Model not found"
- Pull the model first: `ollama pull llama2`
- Verify model name matches in `main.py`

### Error: "Connection refused"
- Ensure backend is running on `http://localhost:8000`
- Check CORS is enabled (it is by default in main.py)
- Try: `curl http://localhost:8000/api/health`

### Slow Generation
- Llama2 can be slow on CPU (5-10 min per section)
- Use a GPU if available for faster generation
- Or use a smaller model like `mistral`

### Memory Issues
- Some models require 8GB+ RAM
- If you get out-of-memory errors, try a smaller model
- Or close other applications

## Performance Notes
- **First request**: May take 30-60 seconds to load model into memory
- **Subsequent requests**: Usually 2-5 minutes per section on CPU
- **GPU**: 30-60 seconds per section (if available)

## Security Notes
- This setup runs locally with no internet connectivity
- All processing happens on your machine
- No data is sent to external APIs
