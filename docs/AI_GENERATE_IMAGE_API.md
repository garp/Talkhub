# AI Image Generation API

Generate images using AI (DALL-E 3) based on text prompts. The generated image is automatically uploaded to S3 and the S3 URL is returned.

---

## Endpoint

```
POST /ai/generate-image
```

### Authentication

Requires Bearer token in Authorization header.

```
Authorization: Bearer <your_jwt_token>
```

---

## Request

### Headers

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |
| `Content-Type` | `application/json` | Yes |

### Body Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | **Yes** | - | Text description of the image to generate (1-4000 characters) |
| `size` | string | No | `1024x1024` | Image dimensions: `1024x1024`, `1024x1792`, `1792x1024` |
| `quality` | string | No | `standard` | Image quality: `standard` or `hd` |
| `style` | string | No | `vivid` | Image style: `vivid` or `natural` |

### Size Options

| Size | Aspect Ratio | Best For |
|------|--------------|----------|
| `1024x1024` | 1:1 (Square) | Profile pictures, icons, general use |
| `1024x1792` | 9:16 (Portrait) | Mobile wallpapers, stories, vertical content |
| `1792x1024` | 16:9 (Landscape) | Banners, headers, desktop wallpapers |

### Quality Options

| Quality | Description | Cost |
|---------|-------------|------|
| `standard` | Good quality, faster generation | Lower |
| `hd` | Higher detail and consistency | Higher |

### Style Options

| Style | Description |
|-------|-------------|
| `vivid` | Hyper-real and dramatic images |
| `natural` | More natural, less hyper-real images |

---

## Example Requests

### Basic Request (Minimal)

```bash
curl -X POST "https://api.example.com/ai/generate-image" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cute cat sitting on a rainbow in space"
  }'
```

### Full Request (All Options)

```bash
curl -X POST "https://api.example.com/ai/generate-image" \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A futuristic city at sunset with flying cars and neon lights",
    "size": "1792x1024",
    "quality": "hd",
    "style": "vivid"
  }'
```

---

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "message": "Image generated successfully",
    "image": {
      "url": "https://your-bucket.s3.region.amazonaws.com/ai-generated/1705312345678_uuid.png",
      "originalPrompt": "A cute cat sitting on a rainbow in space",
      "revisedPrompt": "A cute fluffy orange tabby cat sitting gracefully on a vibrant rainbow arc floating in the cosmic expanse of outer space, with stars and galaxies visible in the background",
      "size": "1024x1024",
      "quality": "standard",
      "style": "vivid",
      "generatedAt": "2026-01-15T10:30:00.000Z"
    }
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | S3 URL of the generated image (permanent, publicly accessible) |
| `originalPrompt` | string | The prompt you submitted |
| `revisedPrompt` | string | The enhanced prompt used by DALL-E (may differ from original) |
| `size` | string | Image dimensions used |
| `quality` | string | Quality level used |
| `style` | string | Style used |
| `generatedAt` | string | ISO timestamp of generation |

---

## Error Responses

### 400 Bad Request - Validation Error

```json
{
  "success": false,
  "message": "Prompt is required"
}
```

### 400 Bad Request - Prompt Too Long

```json
{
  "success": false,
  "message": "Prompt must be 4000 characters or less"
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Failed to generate image: No image URL in response"
}
```

---

## Frontend Integration

### TypeScript Types

```typescript
interface GenerateImageRequest {
  prompt: string;
  size?: '1024x1024' | '1024x1792' | '1792x1024';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
}

interface GeneratedImage {
  url: string;
  originalPrompt: string;
  revisedPrompt: string;
  size: string;
  quality: string;
  style: string;
  generatedAt: string;
}

interface GenerateImageResponse {
  success: boolean;
  data: {
    message: string;
    image: GeneratedImage;
  };
}
```

### React/TypeScript Example

```typescript
async function generateAIImage(
  prompt: string,
  options?: {
    size?: '1024x1024' | '1024x1792' | '1792x1024';
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
  }
): Promise<GenerateImageResponse> {
  const response = await fetch('/ai/generate-image', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      ...options,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to generate image');
  }

  return response.json();
}
```

### React Component Example

```tsx
import React, { useState } from 'react';

function AIImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await generateAIImage(prompt, {
        size: '1024x1024',
        quality: 'standard',
        style: 'vivid',
      });

      setImageUrl(response.data.image.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate image');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-image-generator">
      <h2>AI Image Generator</h2>
      
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the image you want to generate..."
        maxLength={4000}
        rows={4}
      />
      
      <button onClick={handleGenerate} disabled={loading || !prompt.trim()}>
        {loading ? 'Generating...' : 'Generate Image'}
      </button>

      {error && <p className="error">{error}</p>}

      {imageUrl && (
        <div className="generated-image">
          <img src={imageUrl} alt="AI Generated" />
          <a href={imageUrl} target="_blank" rel="noopener noreferrer">
            Open Full Size
          </a>
        </div>
      )}
    </div>
  );
}
```

### CSS Styling Example

```css
.ai-image-generator {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.ai-image-generator textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
}

.ai-image-generator button {
  width: 100%;
  padding: 12px;
  margin-top: 12px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.ai-image-generator button:hover:not(:disabled) {
  background: #4338ca;
}

.ai-image-generator button:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.error {
  color: #dc2626;
  margin-top: 12px;
}

.generated-image {
  margin-top: 20px;
  text-align: center;
}

.generated-image img {
  max-width: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.generated-image a {
  display: inline-block;
  margin-top: 12px;
  color: #4f46e5;
  text-decoration: none;
}
```

---

## Rate Limits & Best Practices

### Rate Limits
- OpenAI enforces rate limits on DALL-E API calls
- Consider implementing client-side rate limiting
- Show loading states during generation (can take 10-30 seconds)

### Best Practices

1. **Prompt Writing**
   - Be specific and descriptive
   - Include style, lighting, and composition details
   - Example: "A serene mountain landscape at golden hour, with snow-capped peaks reflecting in a crystal-clear lake, photorealistic style"

2. **Error Handling**
   - Always handle network errors gracefully
   - Provide retry functionality for failed generations
   - Show meaningful error messages to users

3. **Performance**
   - Cache generated images when possible
   - Use appropriate image sizes for the use case
   - Consider lazy loading for galleries

4. **Content Policy**
   - OpenAI's content policy applies
   - Avoid generating harmful, misleading, or inappropriate content
   - The API may refuse certain prompts

---

## Notes

- Generated images are stored permanently in S3
- The `revisedPrompt` shows how DALL-E interpreted your prompt (often enhanced)
- HD quality takes longer but produces more detailed images
- Image generation typically takes 10-30 seconds depending on complexity
