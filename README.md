# Gemini Discord Bot 🤖

An advanced AI-powered Discord bot featuring multimodal content processing, sophisticated game systems, and intelligent conversation management 🚀

![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5.4-blue.svg)
![Discord.js](https://img.shields.io/badge/Discord.js-14.15.3-5865F2.svg)
![Google Genkit](https://img.shields.io/badge/Google%20Genkit-1.14.0-4285F4.svg)
![Gemini AI](https://img.shields.io/badge/Gemini%20AI-2.5%20Flash%20Lite-orange.svg)
![Prisma](https://img.shields.io/badge/Prisma-6.13.0-2D3748.svg)
![SQLite](https://img.shields.io/badge/SQLite-database-003B57.svg)

## 🎯 Core Features

| Feature | Description |
|---------|-------------|
| **Real-time Streaming Chat** | AI responses stream in real-time with intelligent message editing and context awareness |
| **Multimodal Content Processing** | Comprehensive support for images, videos, PDFs, URLs, and rich media analysis |
| **Complete Game System** | Six fully-featured games with AI integration including TicTacToe, RPG, GeoGuesser, and more |
| **Intelligent Message Routing** | AI-powered intent classification and specialized flow orchestration |
| **Advanced Authentication** | Hierarchical operator system with primary and sub-operator management |
| **Message Cache System** | Sliding window conversation cache with 64-message threshold and context optimization |
| **Content Detection Engine** | Generic attachment caching and multimodal content analysis |
| **Voice Generation** | Multi-voice text-to-speech with Google AI integration |

## 🗣️ Voice Generation System

| Feature | Description |
|---------|-------------|
| **Multi-Voice Support** | 26 distinct AI voices with diverse personalities including Charon (professional), Fenrir (excitable), Aoede (musical), and Kore (authoritative) |
| **Advanced Audio Processing** | PCM to WAV conversion, duration calculation, and waveform visualization |
| **Discord Integration** | Seamless audio file delivery with metadata and interactive voice selection |
| **Content Filtering** | Built-in safety validation and content moderation |

## 🎮 Complete Game System

| Game | Description |
|------|-------------|
| **AI Uprising** | Immersive text-based RPG with AI-powered narrative, combat system, character progression, and equipment management |
| **TicTacToe** | Classic game with intelligent AI opponent featuring three difficulty levels and strategic decision-making |
| **GeoGuesser** | Geographic guessing game with AI validation, curated location database, and Mapillary street imagery |
| **Blackjack** | Full casino-style card game with betting system, chip management, and standard blackjack rules |
| **Hangman** | Word guessing game with AI word generation, visual progression, and progressive hint system |
| **WordScramble** | Programming-focused vocabulary puzzle with multiplayer support and technology terms |

## 🎨 AI-Powered Content Generation

| Capability | Description |
|------------|-------------|
| **Image Generation** | Gemini 2.0 Flash image generation with natural language prompt parsing and multiple artistic styles |
| **Code Execution** | Server-side Python code execution with real-time streaming and comprehensive error handling |
| **Search Grounding** | Real-time web search integration with citation support and source verification |
| **Video Analysis** | YouTube and general video processing with multimodal AI understanding |
| **PDF Processing** | Document analysis and content extraction with streaming responses |
| **URL Context** | Web page analysis and content summarization with intelligent routing |

## 🧠 Intelligent Message Processing

| Component | Description |
|-----------|-------------|
| **Flow Orchestrator** | Central routing hub analyzing content and directing to appropriate specialized processing flows |
| **Content Detection Service** | Comprehensive analysis of message content to determine optimal processing strategies |
| **Message Validator** | Response strategy determination based on mentions, replies, game mode, and autonomous opportunities |
| **Context Optimization** | AI-powered conversation history filtering with relevance scoring and token optimization |
| **Attachment Caching** | Generic caching system eliminating duplicate downloads and enabling instant access |

## 🔐 Security & Authentication

| Feature | Description |
|---------|-------------|
| **Hierarchical Operators** | Primary operator from environment with sub-operator management capabilities |
| **Channel Whitelisting** | Separate bot and autonomous response whitelists with database persistence |
| **Domain Security** | Strict domain whitelisting for media processing (Discord CDN, approved platforms only) |
| **Content Validation** | Comprehensive file size, type, and security validation for all attachments |
| **Natural Language Auth** | Conversational interface for managing operators and whitelists through AI understanding |

## 📊 Advanced Data Management

| System | Description |
|--------|-------------|
| **Message Cache Service** | Sliding window conversation cache with automatic initialization and context management |
| **Game State Persistence** | Complete game state serialization and recovery with timeout management |
| **Prisma Database** | SQLite-based storage for users, channels, messages, and game sessions |
| **Relevance Scoring** | Multi-dimensional conversation analysis for intelligent context optimization |
| **Generic Attachment System** | Unified caching architecture for images, PDFs, videos, and future content types |

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ with NPM package manager
- Discord Bot Token from Discord Developer Portal
- Google AI API Key with Genkit access
- Windows environment (optimized for Windows development)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/gemini-discord-bot-rewrite.git
cd gemini-discord-bot-rewrite
```

```bash
# 2. Install dependencies
npm install
```

```bash
# 3. Set up environment variables
cp .env.example .env
# Edit .env with your API keys and configuration
```

```bash
# 4. Initialize the database
npm run db:init
```

```bash
# 5. Build the project
npm run build
```

```bash
# 6. Start the bot
npm start
```

```bash
# 7. For development with hot reload
npm run dev
```