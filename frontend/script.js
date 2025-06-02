// Variables globales
let currentFestivalId = null;

// Fonction pour afficher un message de chargement
function showLoading(container, message = 'Chargement en cours...') {
    if (!container) return;
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>${message}</p>
        </div>
    `;
}

// Fonction pour afficher un message d'erreur
function showError(container, message) {
    if (!container) return;
    container.innerHTML = `
        <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <p>${message}</p>
            <button class="btn btn-sm" onclick="window.location.reload()">
                <i class="fas fa-sync-alt"></i> Réessayer
            </button>
        </div>
    `;
}

// Fonction pour afficher une notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type} show`;
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-icon">
                ${type === 'success' ? '<i class="fas fa-check-circle"></i>' : 
                  type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' : 
                  type === 'warning' ? '<i class="fas fa-exclamation-triangle"></i>' : 
                  '<i class="fas fa-info-circle"></i>'}
            </div>
            <div class="notification-message">${message}</div>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                &times;
            </button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Supprimer automatiquement après 5 secondes
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Fonction pour formater la date en français
function formatDate(dateString) {
    if (!dateString) return '';
    
    const options = { 
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    };
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString; // Vérifier si la date est valide
        return date.toLocaleDateString('fr-FR', options);
    } catch (error) {
        console.error('Erreur de formatage de date:', error);
        return dateString;
    }
}

// Fonction pour formater l'heure
function formatTime(timeString) {
    if (!timeString) return '';
    try {
        // Si l'heure est au format HH:MM
        if (/^\d{2}:\d{2}$/.test(timeString)) {
            const [hours, minutes] = timeString.split(':');
            return `${hours}h${minutes}`;
        }
        
        // Si c'est un objet Date
        const date = new Date(timeString);
        if (!isNaN(date.getTime())) {
            return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }
        
        return timeString;
    } catch (error) {
        console.error('Erreur de formatage de l\'heure:', error);
        return timeString;
    }
}

// Fonction utilitaire pour animer les éléments
function animateElements(selector, animationClass = 'fade-in') {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el, index) => {
        setTimeout(() => {
            el.classList.add(animationClass);
        }, index * 100);
    });
}

// Fonction pour créer une carte de festival
function createFestivalCard(festival, index, isPast = false) {
    const card = document.createElement('div');
    card.className = `festival-card ${isPast ? 'past' : ''}`;
    
    try {
        // Formater la date
        const formattedDate = formatDate(festival.date);
        
        // Vérifier si l'image existe, sinon utiliser une image par défaut
        const imageUrl = festival.image ? `/images/${festival.image}` : '/images/default-festival.jpg';
        
        card.innerHTML = `
            <div class="festival-image">
                <img src="${imageUrl}" alt="${festival.nom || 'Festival'}" 
                     onerror="this.src='/images/default-festival.jpg';">
                ${isPast ? '<div class="past-badge">Terminé</div>' : ''}
            </div>
            <div class="festival-content">
                <h3>${festival.nom || 'Festival sans nom'}</h3>
                <p class="festival-date">
                    <i class="far fa-calendar-alt"></i> ${formattedDate}
                </p>
                ${festival.lieu ? `<p class="festival-location">
                    <i class="fas fa-map-marker-alt"></i> ${festival.lieu}
                </p>` : ''}
                ${festival.description ? `<p class="festival-description">
                    ${festival.description}
                </p>` : ''}
                <div class="festival-actions">
                    <a href="/static/festival.html?id=${festival.id || ''}" class="btn btn-primary">
                        Voir les trajets <i class="fas fa-arrow-right"></i>
                    </a>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Erreur lors de la création de la carte de festival:', error);
        card.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erreur de chargement des données du festival</p>
            </div>
        `;
    }
    
    return card;
}

// Fonction pour charger et afficher les festivals
async function loadFestivals() {
    const container = document.getElementById('festivals');
    if (!container) return;
    
    showLoading(container, 'Chargement des festivals en cours...');
    
    try {
        const response = await fetch('/api/festivals', { 
            headers: { 'ngrok-skip-browser-warning': 'true' } 
        });
        
        if (!response.ok) {
            throw new Error('Erreur lors du chargement des festivals');
        }
        
        const festivals = await response.json();
        
        // Vérifier si des festivals sont disponibles
        if (!festivals || !Array.isArray(festivals) || festivals.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-calendar-plus"></i>
                    <p>Aucun festival à venir pour le moment</p>
                    <a href="/static/add_festival.html" class="btn btn-primary">
                        <i class="fas fa-plus"></i> Ajouter un festival
                    </a>
                </div>`;
            return;
        }
        
        // Trier les festivals par date
        festivals.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date(0);
            const dateB = b.date ? new Date(b.date) : new Date(0);
            return dateA - dateB;
        });
        
        // Séparer les festivals passés et à venir
        const now = new Date();
        const upcomingFestivals = [];
        const pastFestivals = [];
        
        festivals.forEach(festival => {
            try {
                const festivalDate = festival.date ? new Date(festival.date) : null;
                if (festivalDate && !isNaN(festivalDate.getTime())) {
                    if (festivalDate >= now) {
                        upcomingFestivals.push(festival);
                    } else {
                        pastFestivals.push(festival);
                    }
                } else {
                    // Si la date est invalide, on la considère comme à venir par défaut
                    upcomingFestivals.push(festival);
                }
            } catch (error) {
                console.error('Erreur lors du traitement de la date du festival:', error);
                upcomingFestivals.push(festival);
            }
        });
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Afficher les festivals à venir
        if (upcomingFestivals.length > 0) {
            const upcomingSection = document.createElement('section');
            upcomingSection.className = 'festivals-section';
            upcomingSection.innerHTML = '<h2><i class="fas fa-calendar-alt"></i> Festivals à venir</h2>';
            
            const upcomingGrid = document.createElement('div');
            upcomingGrid.className = 'festivals-grid';
            
            upcomingFestivals.forEach((festival, index) => {
                upcomingGrid.appendChild(createFestivalCard(festival, index));
            });
            
            upcomingSection.appendChild(upcomingGrid);
            container.appendChild(upcomingSection);
        }
        
        // Afficher les festivals passés (si demandé)
        if (pastFestivals.length > 0) {
            const pastSection = document.createElement('section');
            pastSection.className = 'festivals-section';
            
            const pastFestivalsHTML = pastFestivals
                .map((festival, index) => createFestivalCard(festival, index, true).outerHTML)
                .join('');
            
            pastSection.innerHTML = `
                <h2 class="past-festivals-header">
                    <i class="fas fa-history"></i> Festivals passés
                    <button id="toggle-past-festivals" class="btn btn-sm btn-link">
                        <i class="fas fa-chevron-down"></i> Afficher
                    </button>
                </h2>
                <div id="past-festivals-container" class="festivals-grid" style="display: none;">
                    ${pastFestivalsHTML}
                </div>
            `;
            
            container.appendChild(pastSection);
            
            // Gestion du bouton d'affichage des festivals passés
            const toggleButton = document.getElementById('toggle-past-festivals');
            const pastContainer = document.getElementById('past-festivals-container');
            
            if (toggleButton && pastContainer) {
                toggleButton.addEventListener('click', () => {
                    const isHidden = pastContainer.style.display === 'none';
                    pastContainer.style.display = isHidden ? 'grid' : 'none';
                    toggleButton.innerHTML = isHidden 
                        ? '<i class="fas fa-chevron-up"></i> Masquer'
                        : '<i class="fas fa-chevron-down"></i> Afficher';
                });
            }
        }
        
        // Ajouter des animations d'entrée
        animateElements('.festival-card');
        
    } catch (error) {
        console.error('Erreur lors du chargement des festivals:', error);
        showError(container, 'Impossible de charger les festivals. Veuillez réessayer plus tard.');
    } finally {
        // Cacher l'animation de chargement
        const loadingElement = document.querySelector('.loading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }
}

// Fonction pour charger et afficher les trajets d'un festival
async function loadTrajets(festival_id) {
    const container = document.getElementById('trajets');
    if (!container) return;
    
    // Afficher un indicateur de chargement
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>Chargement des trajets en cours...</p>
        </div>
    `;
    
    try {
        // Récupérer les informations du festival
        const [festivalResponse, trajetsResponse] = await Promise.all([
            fetch(`/api/festivals`),
            fetch(`/api/trajets/${festival_id}`, { 
                headers: { 'ngrok-skip-browser-warning': 'true' } 
            })
        ]);
        
        if (!festivalResponse.ok || !trajetsResponse.ok) {
            throw new Error('Erreur lors du chargement des données');
        }
        
        const festivals = await festivalResponse.json();
        const trajets = await trajetsResponse.json();
        
        // Trouver le festival correspondant
        const festival = festivals.find(f => f.id == festival_id);
        
        // Mettre à jour le titre de la page
        const titleElement = document.getElementById('festival-nom');
        if (titleElement && festival) {
            titleElement.textContent = `Covoiturage pour ${festival.nom}`;
            document.title = `Covoiturage - ${festival.nom} | Covoiturage Festival`;
        }
        
        // Vider le conteneur
        container.innerHTML = '';
        
        // Afficher un message si aucun trajet n'est disponible
        if (trajets.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-car-side"></i>
                    <h3>Aucun trajet disponible</h3>
                    <p>Soyez le premier à proposer un trajet pour ce festival !</p>
                </div>
            `;
            return;
        }
        
        // Afficher chaque trajet
        trajets.forEach((trajet, index) => {
            const trajetElement = document.createElement('div');
            trajetElement.className = `trajet fade-in ${trajet.complet ? 'completed' : ''}`;
            trajetElement.style.animationDelay = `${index * 0.1}s`;
            
            trajetElement.innerHTML = `
                <div class="trajet-header">
                    <div class="trajet-details">
                        <h3><i class="fas fa-map-marker-alt"></i> ${trajet.depart}</h3>
                        <p class="trajet-time"><i class="far fa-clock"></i> ${trajet.heure}</p>
                    </div>
                    <div class="trajet-places">
                        <span class="badge">
                            <i class="fas fa-users"></i> ${trajet.places} place${trajet.places > 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
                <div class="trajet-contact">
                    <p><i class="fas fa-user"></i> ${trajet.contact}</p>
                </div>
                <div class="trajet-actions">
                    <div class="secret-input">
                        <input 
                            type="password" 
                            id="secret-${index}" 
                            placeholder="Mot-clé secret"
                            class="form-control"
                        >
                    </div>
                    <button 
                        onclick="markComplet(${festival_id}, ${index})" 
                        class="btn btn-sm ${trajet.complet ? 'btn-secondary' : 'btn-success'}"
                        ${trajet.complet ? 'disabled' : ''}
                    >
                        <i class="fas fa-${trajet.complet ? 'check' : 'check-double'}"></i>
                        ${trajet.complet ? 'Complet' : 'Marquer comme complet'}
                    </button>
                    <button 
                        onclick="deleteTrajet(${festival_id}, ${index})" 
                        class="btn btn-sm btn-danger"
                    >
                        <i class="fas fa-trash"></i> Supprimer
                    </button>
                </div>
            `;
            
            container.appendChild(trajetElement);
        });
    } catch (error) {
        console.error('Erreur:', error);
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Erreur de chargement</h3>
                <p>Impossible de charger les trajets. Veuillez réessayer plus tard.</p>
                <button onclick="loadTrajets(${festival_id})" class="btn">
                    <i class="fas fa-sync-alt"></i> Réessayer
                </button>
            </div>
        `;
    }
}

async function addTrajet(festival_id) {
    const depart = document.getElementById('depart').value;
    const heure = document.getElementById('heure').value;
    const places = document.getElementById('places').value;
    const contact = document.getElementById('contact').value;
    const secret = document.getElementById('secret').value;

    const trajet = {
        festival_id: festival_id,
        depart: depart,
        heure: heure,
        places: parseInt(places),
        contact: contact,
        secret: secret,
        complet: false
    };

    await fetch('/api/trajets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify(trajet)
    });

    loadTrajets(festival_id);
}

async function markComplet(festival_id, index) {
    const secret = document.getElementById(`secret-${index}`).value;
    await fetch(`/api/trajets/${festival_id}/complet`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ index, secret })
    });
    loadTrajets(festival_id);
}

async function deleteTrajet(festival_id, index) {
    const secret = document.getElementById(`secret-${index}`).value;
    await fetch(`/api/trajets/${festival_id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ index, secret })
    });
    loadTrajets(festival_id);
}


// Gestionnaire d'événements pour le formulaire d'ajout de trajet
function setupTrajetForm() {
    const form = document.getElementById('trajet-form');
    if (!form) return;
    
    const festivalId = new URLSearchParams(window.location.search).get('id');
    if (!festivalId) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitButton = form.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;
        
        try {
            // Désactiver le bouton pendant l'envoi
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi en cours...';
            
            await addTrajet(parseInt(festivalId));
            
            // Réinitialiser le formulaire après un ajout réussi
            form.reset();
            showNotification('Trajet ajouté avec succès !', 'success');
        } catch (error) {
            console.error('Erreur:', error);
            showNotification('Erreur lors de l\'ajout du trajet', 'error');
        } finally {
            // Réactiver le bouton
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
        }
    });
}

// Fonction pour initialiser le chat
function setupChat() {
    const chatContainer = document.getElementById('chat-container');
    const chatToggle = document.getElementById('chat-toggle');
    const chatMessages = document.getElementById('chat-messages');
    
    if (!chatContainer || !chatToggle || !chatMessages) return;
    
    let isChatOpen = true;
    
    // Basculer l'état du chat
    chatToggle.addEventListener('click', () => {
        isChatOpen = !isChatOpen;
        
        if (isChatOpen) {
            chatContainer.style.height = '500px';
            chatToggle.innerHTML = '<i class="fas fa-chevron-down"></i>';
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            chatContainer.style.height = '50px';
            chatToggle.innerHTML = '<i class="fas fa-chevron-up"></i>';
        }
    });
    
    // Faire défiler vers le bas automatiquement
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', () => {
    // Charger les festivals sur la page d'accueil
    if (document.getElementById('festivals')) {
        loadFestivals();
    }
    
    // Configurer le formulaire d'ajout de trajet
    setupTrajetForm();
    
    // Configurer le chat
    setupChat();
    
    // Initialiser les tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
});
