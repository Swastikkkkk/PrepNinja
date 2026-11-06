# HackX - Environment Setup Guide

This guide will help you set up the required environment variables for the HackX project before running it.

## 🔐 Security Notice

**IMPORTANT:** Never commit `.env` files to Git. They are already included in `.gitignore` to prevent accidental commits of sensitive API keys.

## 📋 Prerequisites

You'll need to obtain API keys from the following services:

1. **Cloudinary** (for media storage) - https://cloudinary.com
2. **NVIDIA Nemotron** (for AI features, free key) - https://build.nvidia.com
3. **Deepgram** (for speech-to-text) - https://deepgram.com
4. **Murf AI** (for text-to-speech) - https://murf.ai
5. **JDoodle** (optional, for code compilation) - https://www.jdoodle.com/compiler-api

## 🚀 Setup Instructions

### 1. Frontend Setup (hackx folder)

```bash
cd hackx
cp ../.env.example .env
```

Edit the `.env` file and add your API keys:
- `VITE_MURF_API_KEY` - Your Murf AI API key
- `VITE_JDOODLE_CLIENT_ID` - (Optional) Your JDoodle client ID
- `VITE_JDOODLE_CLIENT_SECRET` - (Optional) Your JDoodle client secret

### 2. Backend Setup (backend folder)

```bash
cd backend
cp .env.example .env
```

Edit the `.env` file and add your API keys:
- `CLOUDINARY_CLOUD_NAME` - Your Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Your Cloudinary API key
- `CLOUDINARY_API_SECRET` - Your Cloudinary API secret
- `NVIDIA_API_KEY` - Your NVIDIA API key (nvapi-...)
- `DEEPGRAM_API_KEY` - Your Deepgram API key
- `PORT` - Server port (default: 8080)

## 🧪 Testing Your Setup

### Frontend
```bash
cd hackx
npm install
npm run dev
```

### Backend
```bash
cd backend
npm install
node server.js
```

If you see any errors about missing API keys, double-check your `.env` files.

## 📁 Project Structure

```
HackX/
├── .env                    # Frontend environment variables (DO NOT COMMIT)
├── .env.example            # Frontend environment template (safe to commit)
├── .gitignore             # Git ignore rules
├── hackx/                 # Frontend React application
│   └── .gitignore
├── backend/               # Backend Express server
│   ├── .env              # Backend environment variables (DO NOT COMMIT)
│   ├── .env.example      # Backend environment template (safe to commit)
│   └── .gitignore
└── SETUP.md              # This file
```

## ⚠️ Common Issues

1. **"API key not found" errors**: Make sure you've created the `.env` files and added all required keys
2. **CORS errors**: Ensure your backend is running on the correct port
3. **Upload failures**: Check that the `backend/uploads/` directory exists

## 🤝 Contributing

When contributing to this project:
1. Never commit your `.env` files
2. Update `.env.example` files if you add new environment variables
3. Document any new API requirements in this guide

## 📝 Notes

- The `.env` files are already in `.gitignore` and will not be tracked by Git
- Always use `.env.example` as a template for required environment variables
- Keep your API keys private and never share them publicly
