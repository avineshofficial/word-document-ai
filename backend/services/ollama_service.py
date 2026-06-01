"""
ollama_service.py  —  DEPRECATED / NOT USED

This service previously handled AI text generation via a local Ollama instance
(llama3 model running at http://localhost:11434).

It has been superseded: the frontend (ContentGenerator.tsx) now calls the
Anthropic Claude API directly from the browser, so no backend AI service is
needed or instantiated.

This file is retained only to avoid breaking any legacy imports that may
reference it.  It is NOT imported or used anywhere in main.py.

To restore Ollama-based generation, uncomment the class below and wire it
back into a new /api/generate-single-chapter endpoint in main.py.
"""

# import aiohttp
# import asyncio
# import re
# from typing import List, Dict, Any
#
# class OllamaService:
#     def __init__(self, base_url: str = "http://localhost:11434"):
#         self.base_url = base_url
#         self.model    = "llama3"
#
#     async def generate_content(self, prompt: str, max_tokens: int) -> str:
#         ...
#
#     async def generate_content_for_headings(self, headings, words_per_section) -> dict:
#         ...
#
#     async def generate_chat_content(self, heading, context, words) -> str:
#         ...
#
#     async def generate_single_heading(self, heading) -> str:
#         ...