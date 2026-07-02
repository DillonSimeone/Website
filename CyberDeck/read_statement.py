import zipfile
import re

def get_docx_text(filepath):
    try:
        with zipfile.ZipFile(filepath) as z:
            doc_xml = z.read('word/document.xml').decode('utf-8')
            text = re.sub(r'<[^>]+>', ' ', doc_xml)
            text = re.sub(r'\s+', ' ', text)
            return text
    except Exception as e:
        return str(e)

text = get_docx_text(r'F:\Github\Website\public\CyberDeck\CyberdeckResources\Tracy Held Bio & Artist Statement.docx')
with open('scratch_statement.txt', 'w', encoding='utf-8') as f:
    f.write(text)

print("Text length:", len(text))
print("Snippet:", text[:2000])
