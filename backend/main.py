from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
import json
import os
import asyncio
from datetime import datetime
from typing import List, Dict
import uuid

app = FastAPI()

app.mount("/static", StaticFiles(directory="frontend"), name="static")
app.mount("/images", StaticFiles(directory="images"), name="images")

FESTIVALS_FILE = "backend/data/festivals.json"
TRAJETS_FILE = "backend/data/trajets.json"

# Gestion des connexions WebSocket
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_names: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.user_names[websocket] = f"User-{len(self.active_connections)}"
        return self.user_names[websocket]

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            if websocket in self.user_names:
                del self.user_names[websocket]

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                self.disconnect(connection)

manager = ConnectionManager()

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("frontend/index.html", "r", encoding="utf-8") as f:
        content = f.read()
    headers = {"ngrok-skip-browser-warning": "true"}
    return HTMLResponse(content=content, headers=headers)

# Route WebSocket pour le chat
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    username = await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            message = {
                "username": username,
                "text": message_data.get("text", ""),
                "timestamp": datetime.now().isoformat()
            }
            await manager.broadcast(message)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/festivals")
async def get_festivals():
    with open(FESTIVALS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

@app.post("/api/festivals")
async def add_festival(request: Request):
    new_festival = await request.json()
    with open(FESTIVALS_FILE, "r+", encoding="utf-8") as f:
        festivals = json.load(f)
        new_festival["id"] = max(f["id"] for f in festivals) + 1 if festivals else 1
        festivals.append(new_festival)
        f.seek(0)
        json.dump(festivals, f, ensure_ascii=False, indent=4)
    return {"message": "Festival ajouté avec succès"}

@app.get("/api/trajets/{festival_id}")
async def get_trajets(festival_id: int):
    try:
        with open(TRAJETS_FILE, "r", encoding="utf-8") as f:
            try:
                trajets = json.load(f)
            except json.JSONDecodeError:
                return []
                
        # Filtrer les trajets par festival_id et formater la réponse
        result = []
        for trajet in trajets:
            if trajet.get("festival_id") == festival_id:
                # Créer une version formatée du trajet pour la réponse
                trajet_formatte = {
                    "id": trajet.get("id"),
                    "type": trajet.get("type", "aller"),
                    "adresses": trajet.get("adresses", []),
                    "heures": trajet.get("heures", []),
                    "places_par_arret": trajet.get("places_par_arret", []),
                    "places_disponibles": trajet.get("places_disponibles", 0),
                    "prix": trajet.get("prix", 0),
                    "commentaires": trajet.get("commentaires", ""),
                    "contact": trajet.get("contact", ""),
                    "date_creation": trajet.get("date_creation", ""),
                    "complet": trajet.get("complet", False)
                }
                result.append(trajet_formatte)
                
        return result
        
    except Exception as e:
        print(f"Erreur lors de la récupération des trajets: {str(e)}")
        return []

@app.post("/api/trajets")
async def add_trajet(request: Request):
    new_trajet = await request.json()
    
    # Validation des champs requis
    required_fields = ["festival_id", "type", "adresses", "heures", "places_par_arret", "places_disponibles", "contact", "secret"]
    for field in required_fields:
        if field not in new_trajet:
            return {"error": f"Champ manquant: {field}"}, 400
    
    # Validation des tableaux de données
    if len(new_trajet["adresses"]) < 2:
        return {"error": "Au moins deux adresses sont nécessaires (départ et arrivée)"}, 400
    
    if len(new_trajet["adresses"]) != len(new_trajet["heures"]) or len(new_trajet["adresses"]) != len(new_trajet["places_par_arret"]):
        return {"error": "Les tableaux d'adresses, d'heures et de places doivent avoir la même longueur"}, 400
    
    # Ajout d'un ID unique au trajet
    new_trajet["id"] = str(uuid.uuid4())
    new_trajet["date_creation"] = datetime.now().isoformat()
    
    # Lecture et mise à jour du fichier des trajets
    try:
        with open(TRAJETS_FILE, "r+", encoding="utf-8") as f:
            try:
                trajets = json.load(f)
            except json.JSONDecodeError:
                trajets = []
                
            trajets.append(new_trajet)
            f.seek(0)
            json.dump(trajets, f, ensure_ascii=False, indent=4)
            f.truncate()
            
        return {"message": "Trajet ajouté avec succès", "id": new_trajet["id"]}
        
    except Exception as e:
        print(f"Erreur lors de l'ajout du trajet: {str(e)}")
        return {"error": f"Erreur lors de l'ajout du trajet: {str(e)}"}, 500

@app.put("/api/trajets/{festival_id}/complet")
async def mark_complet(festival_id: int, request: Request):
    data = await request.json()
    index = data["index"]
    secret = data["secret"]
    with open(TRAJETS_FILE, "r+", encoding="utf-8") as f:
        trajets = json.load(f)
        filtered = [t for t in trajets if t["festival_id"] == festival_id]
        actual = [i for i, t in enumerate(trajets) if t["festival_id"] == festival_id]
        if index < len(filtered):
            real_index = actual[index]
            if trajets[real_index].get("secret") == secret:
                trajets[real_index]["complet"] = True
                f.seek(0)
                f.truncate()
                json.dump(trajets, f, ensure_ascii=False, indent=4)
                return {"ok": True}
    return {"error": "Mot-clé incorrect"}

@app.post("/api/trajets/{festival_id}/delete")
async def delete_trajet(festival_id: int, request: Request):
    data = await request.json()
    index = data["index"]
    secret = data["secret"]
    with open(TRAJETS_FILE, "r+", encoding="utf-8") as f:
        trajets = json.load(f)
        filtered = [t for t in trajets if t["festival_id"] == festival_id]
        actual = [i for i, t in enumerate(trajets) if t["festival_id"] == festival_id]
        if index < len(filtered):
            real_index = actual[index]
            if trajets[real_index].get("secret") == secret:
                del trajets[real_index]
                f.seek(0)
                f.truncate()
                json.dump(trajets, f, ensure_ascii=False, indent=4)
                return {"ok": True}
    return {"error": "Mot-clé incorrect"}
