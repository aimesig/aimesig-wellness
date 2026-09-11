# AimeSig Smart Chatbot

The Chatbot tab uses an instant client-side Smart Data Engine. It does not download an AI model, use Ollama, call OpenAI/Gemini, or require an API key.

It loads the signed-in user's routines, routine logs, health issues, health checkups, notes, dates, attachment metadata, and many-to-many Issue ↔ Checkup relationships from Firestore and answers through local retrieval, intent detection, filtering, aggregation, and relationship traversal.

This design is intended to respond in under 5 seconds and normally much faster after the Chatbot tab has loaded.
