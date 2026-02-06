
import os
import time
import json
import sqlite3
import random

import google.generativeai as genai
from flask import Flask, render_template, request, jsonify, redirect, session
from werkzeug.security import generate_password_hash, check_password_hash

# ================= BASIC CONFIG =================
app = Flask(__name__)
app.secret_key = "secret123"

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ================= GEMINI CONFIG =================
GOOGLE_API_KEY = "GIVE YOU API"

genai.configure(api_key=GOOGLE_API_KEY)


genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

# ================= QUESTION BANK =================
QUESTION_BANK = {
    "CSE": {
        "Easy": [
            "What is a variable in programming?",
            "Explain the difference between compiler and interpreter.",
            "What is an operating system?"
        ],
        "Medium": [
            "Explain OOP concepts with examples.",
            "What is normalization in databases?",
            "How does HTTP differ from HTTPS?"
        ],
        "Hard": [
            "Explain deadlock and its prevention techniques.",
            "How does garbage collection work in Java/Python?",
            "Explain REST vs SOAP architecture."
        ]
    },
    "ECE": {
        "Easy": [
            "What is Ohm’s Law?",
            "Explain AC and DC signals.",
            "What is a diode?"
        ],
        "Medium": [
            "Explain modulation techniques.",
            "What is a transistor and how does it work?",
            "Explain bandwidth."
        ],
        "Hard": [
            "Explain FFT and its applications.",
            "What is noise figure?",
            "Explain antenna radiation patterns."
        ]
    },
    "ME": {
        "Easy": [
            "What is thermodynamics?",
            "Define stress and strain.",
            "What is a heat engine?"
        ],
        "Medium": [
            "Explain the working of an IC engine.",
            "What is fatigue failure?",
            "Explain Rankine cycle."
        ],
        "Hard": [
            "Explain CFD and its applications.",
            "What is creep?",
            "Explain FEM."
        ]
    },
    "CE": {
        "Easy": [
            "What is cement?",
            "What are the types of loads?",
            "Define beam."
        ],
        "Medium": [
            "Explain RCC.",
            "What is surveying?",
            "Explain soil classification."
        ],
        "Hard": [
            "Explain limit state design.",
            "What is prestressed concrete?",
            "Explain foundation failure modes."
        ]
    }
}

# ================= DATABASE =================
def get_db():
    return sqlite3.connect("users.db")

with get_db() as db:
    db.execute("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT
        )
    """)

# ================= AUTH =================
@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        try:
            with get_db() as db:
                db.execute(
                    "INSERT INTO users(email,password) VALUES (?,?)",
                    (
                        request.form["email"],
                        generate_password_hash(request.form["password"])
                    )
                )
            return redirect("/login")
        except:
            return render_template("signup.html", error="User already exists")
    return render_template("signup.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        with get_db() as db:
            user = db.execute(
                "SELECT * FROM users WHERE email=?",
                (request.form["email"],)
            ).fetchone()

        if user and check_password_hash(user[2], request.form["password"]):
            session.clear()
            session["user"] = request.form["email"]
            return redirect("/setup")

        return render_template("login.html", error="Invalid credentials")

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")

# ================= SETUP =================
@app.route("/setup", methods=["GET", "POST"])
def setup():
    if "user" not in session:
        return redirect("/login")

    if request.method == "POST":
        branch = request.form["branch"]
        level = request.form["level"]

        session["branch"] = branch
        session["level"] = level
        session["question"] = random.choice(QUESTION_BANK[branch][level])

        return redirect("/")

    return render_template("setup.html")



# ================= DASHBOARD =================
# ================= DASHBOARD =================
@app.route("/")
def index():
    if "user" not in session:
        return redirect("/login")
    if "branch" not in session:
        return redirect("/setup")

    # Get the number of questions for the current branch and level
    branch = session["branch"]
    level = session["level"]
    question_count = len(QUESTION_BANK[branch][level])

    return render_template(
        "index.html",
        user=session["user"],
        branch=branch,
        level=level,
        question=session.get("question"),
        question_count=question_count  # Pass the count to template
    )

# ================= NEW QUESTION =================
@app.route("/new-question")
def new_question():
    if "branch" not in session:
        return jsonify({"error": "Session expired"}), 400

    session["question"] = random.choice(
        QUESTION_BANK[session["branch"]][session["level"]]
    )

    return jsonify({"question": session["question"]})

# ================= ANALYSIS (REAL, DYNAMIC) =================
@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        if "user" not in session:
            return jsonify({"error": "Unauthorized"}), 401

        if "video" not in request.files:
            return jsonify({"error": "No video uploaded"}), 400

        video = request.files["video"]
        video_path = os.path.join(UPLOAD_FOLDER, "interview.webm")
        video.save(video_path)

        # Upload video to Gemini
        uploaded = genai.upload_file(path=video_path)

        # Wait (max ~20 seconds)
        for _ in range(10):
            uploaded = genai.get_file(uploaded.name)
            if uploaded.state.name != "PROCESSING":
                break
            time.sleep(2)

        # ================= PROMPT =================
        prompt = f"""
You are an expert technical interview evaluator.

Candidate details:
- Branch: {session['branch']}
- Difficulty: {session['level']}
- Interview Question: {session.get('question')}

Analyze the candidate's spoken answer and communication quality
based strictly on the video provided.

Rules:
- Do NOT fabricate facts.
- Judge confidence from tone, fluency, and clarity.
- Infer eye contact and facial expressions qualitatively.
- Return ONLY valid JSON (no markdown, no explanation).

JSON format:
{{
  "transcript": "summary of what the candidate said",
  "confidence_score": 0,
  "eye_contact": "qualitative assessment",
  "facial_expressions": "observed facial behavior",
  "speaking_style": "calm / rushed / confident / hesitant",
  "feedback_points": [
    "specific improvement 1",
    "specific improvement 2",
    "specific improvement 3"
  ]
}}
"""

        response = model.generate_content([prompt, uploaded])
        genai.delete_file(uploaded.name)

        text = response.text.strip()
        text = text.replace("```json", "").replace("```", "").strip()

        data = json.loads(text)
        return jsonify(data)

    except json.JSONDecodeError:
        return jsonify({
            "error": "AI returned invalid JSON",
            "raw_output": response.text
        }), 500

    except Exception as e:
        print("❌ ANALYSIS ERROR:", e) 
        return jsonify({
            "error": "Analysis failed",
            "details": str(e)
        }), 500

# ================= RUN =================
if __name__ == "__main__":
    app.run(debug=True)
