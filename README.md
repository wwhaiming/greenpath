# GreenPath
AI-powered green card navigation platform \
Created by Whaiming Wang and Gary Zhang for the USAII Global AI Hackathon 2026

## To run in dev mode:
npm install
npm run dev          # Vite on :5173, proxies /api to Flask on :5000
python server.py     # Flask API server

## To build for production (Flask serves everything):
npm run build        # outputs to dist/
python server.py     # serves dist/ + /api/*