# My German Tutor

After reaching an intermediate level in German, I found myself making the same mistakes over and over again. Those mistakes don't get corrected when you speak to people in your every day life, and they tend to stick. That's why I built My German Tutor, a pocket tutor that remembers your mistakes and helps you work on them.

## Features

- Chat with your tutor by text or voice about topics that interest you
- Choose fluid Realtime voice or economical streamed text with optional audio
- Get corrections and explanations in a detailed review after the conversation
- Let your tutor keep track of your errors and generate exercises tailored to your needs
- Have your sentences rewritten in different styles or dialects and listen to them
- Generate flashcards on topics of your choice
- Ask your tutor to explain German grammar and language rules

## Screenshots

### Conversations
![Conversations](screenshots/conversations.png)

### Exercises
![Exercises](screenshots/exercises.png)

### Dashboard
![Dashboard](screenshots/dashboard.png)

## Technology stack

### Backend

- FastAPI
- Supabase PostgreSQL

### Frontend

- React

## Local development

Start the API from the backend directory so its `.env` file is loaded:

```bash
cd backend
uvicorn main:app --reload
```

In another terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend uses Vite's `/api` proxy locally. To call a different API, copy
`frontend/.env.example` to `frontend/.env` and change `VITE_API_URL`.

Realtime voice requires `OPENAI_API_KEY`. Its runtime configuration is:

```bash
OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini
OPENAI_REALTIME_VOICE=marin
REALTIME_SESSION_MAX_SECONDS=420
```

The server logs Realtime token usage and estimated USD cost. Pricing defaults to the
current Mini rates and can be updated without code changes through
`REALTIME_AUDIO_INPUT_PER_MILLION`, `REALTIME_AUDIO_OUTPUT_PER_MILLION`,
`REALTIME_TEXT_INPUT_PER_MILLION`, and `REALTIME_TEXT_OUTPUT_PER_MILLION`.

## Testing

The project includes:
- API smoke tests for core endpoints
- Authorization tests ensuring users cannot access another user's data
- Mocked tests for AI, speech, and translation providers

Run the test suite with:

```bash
pytest
```

## Notes

- Sign up is currently disabled.


## License

The source code in this repository is licensed under the AGPL-3.0 license.

The file `backend/content/nouns_cleaned.csv` is derived from:
https://github.com/gambolputty/german-nouns

Original license: CC BY-SA 4.0
Modifications:
- Removed unused columns
- Filtered entries

The file `backend/content/nouns_cleaned.csv` remains licensed under CC BY-SA 4.0.
