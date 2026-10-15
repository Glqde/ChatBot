# Secure AI Chat Platform

A web-based AI chat application that combines AI-powered conversations
with client-side encryption for stored chat history.

## Features

* User signup and login with JWT authentication
* Password hashing with bcrypt
* Client-side message encryption using AES-256-GCM
* RSA-2048 (RSA-OAEP) for wrapping chat encryption keys
* Chat and message persistence with SQLite
* AI responses through the OpenRouter API
* RESTful backend APIs built with Node.js and Express.js

## Tech Stack

* **Frontend:** HTML, CSS, JavaScript, Web Crypto API
* **Backend:** Node.js, Express.js
* **Database:** SQLite, better-sqlite3
* **Security:** AES-256-GCM, RSA-OAEP, JWT, bcryptjs
* **AI:** OpenRouter API

## Getting Started

### 1\. Clone the repository

``` bash
git clone <your-repository-url>
cd chatbot
```

### 2\. Install backend dependencies

``` bash
cd backend
npm install
```

### 3\. Configure environment variables

Create a `.env` file in the `backend` directory using `.env.example` as
a reference. Add the required configuration values, including your JWT
secret and OpenRouter API key.

**Never commit your `.env` file or API keys to GitHub.**

### 4\. Start the backend

``` bash
npm run dev
```

Then open the local address shown by the server in your browser (the
default port is `3001`).

## Security Note

Chat messages are encrypted in the browser before being stored in
SQLite. To generate AI responses, message content is sent in readable
form to the backend and the OpenRouter API. Therefore, this project
should not be described as providing end-to-end encryption against the
AI provider.

## Project Structure

``` text
secure-chat/
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── crypto.js
└── backend/
    └── src/
        ├── server.js
        ├── db.js
        ├── middleware.js
        └── routes/
            ├── auth.js
            ├── chats.js
            └── ai.js
```

## License

Add a license if you intend to distribute this project publicly.

