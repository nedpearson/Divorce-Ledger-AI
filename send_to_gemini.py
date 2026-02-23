import os
import google.generativeai as genai

# 1. Setup API Key from Replit Secrets
api_key = os.environ['GOOGLE_API_KEY']
genai.configure(api_key=api_key)

# 2. Select the model
model = genai.GenerativeModel('gemini-1.5-flash')

def bundle_code_files(file_list):
    """Reads specific files and formats them for the AI."""
    context = "Here is my current Replit project code:\n\n"
    for file_name in file_list:
        if os.path.exists(file_name):
            with open(file_name, 'r') as f:
                content = f.read()
                context += f"--- FILE: {file_name} ---\n{content}\n\n"
    return context

# 3. Choose which files to send to Gemini
files_to_send = ['main.py', 'requirements.txt'] # Add your other filenames here
project_context = bundle_code_files(files_to_send)

# 4. Ask Gemini a question about your code
prompt = "Analyze this code and suggest one performance improvement and one new feature."

response = model.generate_content([project_context, prompt])

print("--- GEMINI'S ANALYSIS ---")
print(response.text)
