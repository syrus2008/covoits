// Gestion du chat en temps réel
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatUsername = document.getElementById('chat-username');

// Vérifier que les éléments DOM existent
if (!chatMessages || !chatForm || !chatInput) {
    console.error('Éléments du chat introuvables dans le DOM');
} else {
    // Récupérer ou générer un nom d'utilisateur unique
    let username = localStorage.getItem('chatUsername');
    if (!username) {
        username = `User-${Math.floor(Math.random() * 10000)}`;
        localStorage.setItem('chatUsername', username);
    }
    
    // Mettre à jour le champ du nom d'utilisateur
    if (chatUsername) {
        chatUsername.value = username;
        // Mettre à jour le nom d'utilisateur lorsqu'il est modifié
        chatUsername.addEventListener('change', updateUsername);
    }
    // Fonction pour ajouter un message au chat de manière sécurisée
    function addMessage(username, message, timestamp) {
        if (!chatMessages) return;
        
        try {
            const messageElement = document.createElement('div');
            messageElement.classList.add('chat-message');
            
            // Échapper le HTML pour éviter les injections
            const safeUsername = document.createTextNode(username || 'Anonyme').textContent;
            const safeMessage = document.createTextNode(message || '').textContent;
            
            // Formater l'heure
            let formattedTime = '';
            try {
                const time = timestamp ? new Date(timestamp) : new Date();
                formattedTime = time.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
            } catch (e) {
                console.error('Erreur de format de date:', e);
                formattedTime = new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
            }
            
            messageElement.innerHTML = `
                <span class="chat-username">${safeUsername}:</span>
                <span class="chat-text">${safeMessage}</span>
                <span class="chat-time">${formattedTime}</span>
            `;
            
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch (error) {
            console.error('Erreur lors de l\'ajout du message:', error);
        }
    }

    // Gestion de la connexion WebSocket
    let socket;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000; // 3 secondes
    
    function connectWebSocket() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            socket = new WebSocket(`${protocol}${window.location.host}/ws`);
            
            socket.onopen = () => {
                console.log('Connecté au chat');
                reconnectAttempts = 0; // Réinitialiser le compteur de reconnexion
                showChatStatus('Connecté', 'success');
                
                // Envoyer le nom d'utilisateur actuel au serveur
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        username: username,
                        type: 'set_username'
                    }));
                }
            };
            
            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    // Gérer les différents types de messages
                    if (data.type === 'history') {
                        // Charger l'historique des messages
                        if (Array.isArray(data.messages)) {
                            chatMessages.innerHTML = ''; // Vider les messages actuels
                            data.messages.forEach(msg => {
                                addMessage(msg.username, msg.text, msg.timestamp);
                            });
                        }
                    } else if (data.type === 'message' || (data.username && data.text)) {
                        // Afficher un nouveau message
                        addMessage(data.username, data.text, data.timestamp);
                    }
                } catch (e) {
                    console.error('Erreur lors du traitement du message:', e, event.data);
                }
            };
            
            socket.onerror = (error) => {
                console.error('Erreur de connexion WebSocket:', error);
                showChatStatus('Erreur de connexion', 'error');
            };
            
            socket.onclose = () => {
                showChatStatus('Déconnecté', 'warning');
                // Tentative de reconnexion
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    const delay = reconnectDelay * Math.pow(2, reconnectAttempts);
                    console.log(`Tentative de reconnexion dans ${delay/1000} secondes...`);
                    setTimeout(connectWebSocket, delay);
                }
            };
        } catch (error) {
            console.error('Erreur lors de la création de la connexion WebSocket:', error);
        }
    }
    
    // Fonction pour afficher l'état de la connexion
    function showChatStatus(message, type = 'info') {
        // Implémentez l'affichage du statut dans votre interface utilisateur
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
    
    // Démarrer la connexion WebSocket
    connectWebSocket();
    
    // Fonction pour mettre à jour le nom d'utilisateur
    function updateUsername() {
        const newUsername = chatUsername.value.trim();
        if (newUsername && newUsername !== username) {
            username = newUsername;
            localStorage.setItem('chatUsername', username);
            // Envoyer un message système pour informer du changement de nom
            addMessage('Système', `${username} a rejoint la conversation`, new Date().toISOString());
        }
    }
    
    // Envoi d'un message
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const message = chatInput ? chatInput.value.trim() : '';
        
        // Mettre à jour le nom d'utilisateur si modifié
        if (chatUsername) {
            const newUsername = chatUsername.value.trim();
            if (newUsername && newUsername !== username) {
                username = newUsername;
                localStorage.setItem('chatUsername', username);
            }
        }
        
        if (!message) return;
        
        if (socket && socket.readyState === WebSocket.OPEN) {
            try {
                const chatMessage = {
                    type: 'message',
                    username: username.substring(0, 30), // Limiter la longueur du nom d'utilisateur
                    text: message.substring(0, 500) // Limiter la longueur du message
                };
                
                socket.send(JSON.stringify(chatMessage));
                chatInput.value = '';
            } catch (error) {
                console.error('Erreur lors de l\'envoi du message:', error);
                showChatStatus('Erreur lors de l\'envoi du message', 'error');
            }
        } else if (!message) {
            showChatStatus('Le message ne peut pas être vide', 'warning');
        } else if (!socket || socket.readyState !== WebSocket.OPEN) {
            showChatStatus('Connexion au serveur perdue', 'error');
        }
    });
    
    // Vider l'historique du chat toutes les 24h
    const clearChatInterval = setInterval(() => {
        if (chatMessages && confirm("Voulez-vous effacer l'historique du chat ? (Nouvelle journée)")) {
            chatMessages.innerHTML = '';
        }
    }, 24 * 60 * 60 * 1000); // 24 heures en millisecondes
    
    // Nettoyage lors de la fermeture de la page
    window.addEventListener('beforeunload', () => {
        clearInterval(clearChatInterval);
        if (socket) {
            socket.close();
        }
    });
}
