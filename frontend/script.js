// Variables globales
let currentFestivalId = null;

// Fonction pour ouvrir le formulaire de contact
function openContactForm(driverId, trajetId) {
    // Récupérer l'ID du festival depuis l'URL actuelle
    const currentUrl = new URL(window.location.href);
    const festivalId = currentUrl.pathname.split('/').pop();
    
    // Construire l'URL avec tous les paramètres nécessaires
    const url = `/contact?driver_id=${encodeURIComponent(driverId)}&trajet_id=${encodeURIComponent(trajetId)}&festival_id=${encodeURIComponent(festivalId)}`;
    window.open(url, '_blank', 'width=600,height=700');
}

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
        
        // Créer la structure HTML de la carte
        card.innerHTML = `
            <div class="festival-image">
                <img src="${imageUrl}" 
                     alt="${festival.nom || 'Festival'}" 
                     onerror="this.onerror=null; this.src='/images/default-festival.jpg'">
                ${isPast ? '<span class="past-badge">Terminé</span>' : ''}
            </div>
            <div class="festival-content">
                <h3>${festival.nom || 'Festival sans nom'}</h3>
                <div class="festival-meta">
                    <p class="festival-date">
                        <i class="far fa-calendar-alt"></i> ${formattedDate}
                    </p>
                    ${festival.lieu ? `
                    <p class="festival-location">
                        <i class="fas fa-map-marker-alt"></i> ${festival.lieu}
                    </p>` : ''}
                </div>
                ${festival.description ? `
                <div class="festival-description">
                    ${festival.description}
                </div>` : ''}
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
    
    // Forcer les styles inline pour le conteneur principal
    container.style.width = '100%';
    container.style.minWidth = '100%';
    container.style.maxWidth = '100%';
    container.style.margin = '0';
    container.style.padding = '0';
    container.style.boxSizing = 'border-box';
    container.style.display = 'block';
    container.style.overflow = 'visible';
    container.style.position = 'relative';
    container.style.zIndex = '1';
    
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
            console.log(`Affichage de ${upcomingFestivals.length} festivals à venir`);
            
            // Créer la section
            const upcomingSection = document.createElement('section');
            upcomingSection.className = 'festivals-section';
            
            // Créer le titre de la section
            const title = document.createElement('h2');
            title.className = 'section-title';
            title.style.marginBottom = '1rem';
            
            const icon = document.createElement('i');
            icon.className = 'fas fa-calendar-alt';
            title.appendChild(icon);
            title.appendChild(document.createTextNode(' Festivals à venir'));
            
            // Créer la grille
            const upcomingGrid = document.createElement('div');
            upcomingGrid.className = 'festivals-grid';
            
            // Ajouter les cartes à la grille
            upcomingFestivals.forEach((festival, index) => {
                const card = createFestivalCard(festival, index);
                if (card) {
                    console.log(`Ajout de la carte ${index + 1}/${upcomingFestivals.length}:`, festival.nom);
                    // Ajouter un attribut data-index pour le débogage
                    card.setAttribute('data-index', index + 1);
                    upcomingGrid.appendChild(card);
                } else {
                    console.error('Échec de création de la carte pour le festival:', festival.nom);
                }
            });
            
            console.log('Nombre d\'éléments dans la grille:', upcomingGrid.children.length);
            
            // Assembler la section
            upcomingSection.appendChild(title);
            upcomingSection.appendChild(upcomingGrid);
            
            // Vider le conteneur avant d'ajouter la nouvelle section
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
            
            // Ajouter la section au conteneur
            container.appendChild(upcomingSection);
            
            // Forcer un recalcul du style pour s'assurer que le layout est mis à jour
            void container.offsetHeight;
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
            loadingElement.remove(); // ou loadingElement.style.display = 'none';
        }
    } // ← cette accolade manquait
}
async function loadTrajets(festival_id) {
    const trajetsContainer = document.getElementById('trajets');
    if (!trajetsContainer) return;

    showLoading(trajetsContainer, 'Chargement des trajets...');

    try {
        const response = await fetch(`/api/trajets/${festival_id}`);
        if (!response.ok) throw new Error('Erreur lors du chargement des trajets');
        
        const trajets = await response.json();
        
        if (trajets.length === 0) {
            trajetsContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-car-side"></i>
                    <p>Aucun trajet disponible pour le moment</p>
                </div>`;
            return;
        }

        // Trier les trajets par date de création (du plus récent au plus ancien)
        trajets.sort((a, b) => new Date(b.date_creation) - new Date(a.date_creation));

        let html = `
            <div class="trajets-header">
                <h3>Trajets disponibles</h3>
            </div>
            <div class="trajets-list">
        `;

        trajets.forEach((trajet, index) => {
            const isComplet = trajet.complet || trajet.places_disponibles <= 0;
            const typeTrajet = trajet.type === 'retour' ? 'Retour du festival' : 'Aller au festival';
            const iconType = trajet.type === 'retour' ? 'fa-home' : 'fa-ticket-alt';
            
            html += `
                <div class="trajet-card ${isComplet ? 'complet' : ''}" data-index="${index}" data-trajet-id="${trajet.id}">
                    <input type="hidden" id="secret-${trajet.id}" value="${trajet.secret || ''}">
                    <div class="trajet-header">
                        <div class="trajet-type">
                            <i class="fas ${iconType}"></i>
                            ${typeTrajet}
                        </div>
                        <div class="trajet-places ${isComplet ? 'complet' : ''}">
                            <i class="fas fa-users"></i>
                            ${trajet.places_disponibles} place${trajet.places_disponibles > 1 ? 's' : ''} disponible${trajet.places_disponibles > 1 ? 's' : ''}
                            ${trajet.prix > 0 ? `• ${trajet.prix.toFixed(2)} €/pers` : ''}
                        </div>
                    </div>
                    
                    <div class="trajet-details">
                        <div class="trajet-etapes">
                            ${genererEtapesTrajet(trajet)}
                        </div>
                        
                        ${trajet.commentaires ? `
                            <div class="trajet-comment">
                                <i class="fas fa-comment-alt"></i>
                                ${trajet.commentaires}
                            </div>` : ''
                        }
                        
                        <div class="trajet-footer">
                            <div class="trajet-meta">
                                <div class="trajet-contact">
                                <i class="fas fa-user"></i>
                                Conducteur
                            </div>
                            <div class="trajet-date">
                                <i class="far fa-clock"></i>
                                Posté le ${new Date(trajet.date_creation).toLocaleDateString('fr-FR')}
                            </div>
                            <div class="trajet-contact-info" style="display: none;">
                                <i class="fas fa-${trajet.contact && trajet.contact.includes('@') ? 'envelope' : 'phone'}"></i>
                                ${trajet.contact || 'Contact non fourni'}
                            </div>
                            </div>
                            
                            <div class="trajet-actions">
                        <button class="btn btn-sm btn-primary" onclick="openContactForm('${trajet.conducteur_id || 'unknown'}', '${trajet.id}')">
                            <i class="fas fa-envelope"></i> Contacter
                        </button>
                        <div class="trajet-secret-form" id="secret-form-${trajet.id}" style="display: none; margin-top: 10px;">
                            <input type="password" id="secret-input-${trajet.id}" class="form-control form-control-sm" placeholder="Mot-clé secret" style="margin-bottom: 5px;">
                            <div class="d-flex gap-2">
                                <button class="btn btn-sm btn-primary" onclick="confirmMarkComplet(${festival_id}, '${trajet.id}')">
                                    <i class="fas fa-check-double"></i> Confirmer
                                </button>
                                <button class="btn btn-sm btn-outline" onclick="event.preventDefault(); document.getElementById('secret-form-${trajet.id}').style.display = 'none';">
                                    <i class="fas fa-times"></i> Annuler
                                </button>
                            </div>
                        </div>
                        <button class="btn btn-sm ${isComplet ? 'btn-outline' : 'btn-primary'}" 
                                onclick="event.preventDefault(); showSecretForm('${trajet.id}', 'mark')" 
                                ${isComplet ? 'disabled' : ''}>
                            <i class="fas fa-${isComplet ? 'check' : 'check-double'}"></i>
                            ${isComplet ? 'Complet' : 'Marquer complet'}
                        </button>
                        <div class="trajet-secret-form" id="delete-form-${trajet.id}" style="display: none; margin-top: 10px;">
                            <input type="password" id="delete-secret-${trajet.id}" class="form-control form-control-sm" placeholder="Mot-clé secret" style="margin-bottom: 5px;">
                            <div class="d-flex gap-2">
                                <button class="btn btn-sm btn-danger" onclick="confirmDeleteTrajet(${festival_id}, '${trajet.id}')">
                                    <i class="fas fa-trash"></i> Confirmer
                                </button>
                                <button class="btn btn-sm btn-outline" onclick="event.preventDefault(); document.getElementById('delete-form-${trajet.id}').style.display = 'none';">
                                    <i class="fas fa-times"></i> Annuler
                                </button>
                            </div>
                        </div>
                        <button class="btn btn-sm btn-outline" 
                                onclick="event.preventDefault(); showSecretForm('${trajet.id}', 'delete')">
                            <i class="fas fa-trash"></i> Supprimer
                        </button>
                            </div>
                        </div>
                    </div>
                </div>`;
        });

        html += '</div>'; // Fermeture de .trajets-list
        trajetsContainer.innerHTML = html;
        
        // Ajouter les écouteurs d'événements pour afficher/masquer les contacts
        document.querySelectorAll('.trajet-contact').forEach(contactEl => {
            contactEl.addEventListener('click', (e) => {
                e.preventDefault();
                const contactInfo = contactEl.nextElementSibling;
                if (contactInfo && contactInfo.classList.contains('trajet-contact-info')) {
                    contactEl.classList.toggle('active');
                    
                    // Fermer les autres infos de contact ouvertes
                    document.querySelectorAll('.trajet-contact').forEach(otherContact => {
                        if (otherContact !== contactEl && otherContact.classList.contains('active')) {
                            otherContact.classList.remove('active');
                        }
                    });
                }
            });
        });

        // Ajouter l'événement pour afficher le formulaire
        const showFormBtn = document.getElementById('show-trajet-form');
        if (showFormBtn) {
            showFormBtn.addEventListener('click', () => {
                const formContainer = document.getElementById('trajet-form-container');
                if (formContainer) {
                    formContainer.style.display = 'block';
                    showFormBtn.style.display = 'none';
                    window.scrollTo({
                        top: formContainer.offsetTop - 20,
                        behavior: 'smooth'
                    });
                }
            });
        }

    } catch (error) {
        console.error('Erreur:', error);
        showError(trajetsContainer, 'Impossible de charger les trajets. Veuillez réessayer plus tard.');
    }
}

// Fonction pour générer le HTML des étapes d'un trajet
function genererEtapesTrajet(trajet) {
    if (!trajet.adresses || !trajet.heures || trajet.adresses.length === 0) {
        return '<div class="alert alert-warning">Aucune étape définie pour ce trajet</div>';
    }
    
    let html = '';
    const totalEtapes = trajet.adresses.length;
    
    // Ajouter le départ
    if (trajet.adresses[0]) {
        html += `
            <div class="etape depart">
                <div class="etape-point">
                    <i class="fas fa-flag"></i>
                </div>
                <div class="etape-details">
                    <div class="etape-heure">${formatTime(trajet.heures[0])}</div>
                    <div class="etape-lieu">${trajet.adresses[0]}</div>
                    ${trajet.places_par_arret && trajet.places_par_arret[0] !== undefined ? `
                        <div class="etape-places">
                            <i class="fas fa-users"></i>
                            ${trajet.places_par_arret[0]} place${trajet.places_par_arret[0] > 1 ? 's' : ''} disponible${trajet.places_par_arret[0] > 1 ? 's' : ''}
                        </div>` : ''
                    }
                </div>
            </div>`;
    }
    
    // Ajouter les arrêts intermédiaires
    for (let i = 1; i < totalEtapes - 1; i++) {
        if (trajet.adresses[i]) {
            html += `
                <div class="etape arret">
                    <div class="etape-point">
                        <i class="fas fa-map-marker-alt"></i>
                    </div>
                    <div class="etape-details">
                        <div class="etape-heure">${formatTime(trajet.heures[i])}</div>
                        <div class="etape-lieu">${trajet.adresses[i]}</div>
                        ${trajet.places_par_arret && trajet.places_par_arret[i] !== undefined ? `
                            <div class="etape-places">
                                <i class="fas fa-users"></i>
                                ${trajet.places_par_arret[i]} place${trajet.places_par_arret[i] > 1 ? 's' : ''} disponible${trajet.places_par_arret[i] > 1 ? 's' : ''}
                            </div>` : ''
                        }
                    </div>
                </div>`;
        }
    }
    
    // Ajouter l'arrivée
    if (totalEtapes > 1 && trajet.adresses[totalEtapes - 1]) {
        const lastIndex = totalEtapes - 1;
        html += `
            <div class="etape arrivee">
                <div class="etape-point">
                    <i class="fas fa-flag-checkered"></i>
                </div>
                <div class="etape-details">
                    <div class="etape-heure">${formatTime(trajet.heures[lastIndex])}</div>
                    <div class="etape-lieu">${trajet.adresses[lastIndex]}</div>
                    ${trajet.places_par_arret && trajet.places_par_arret[lastIndex] !== undefined ? `
                        <div class="etape-places">
                            <i class="fas fa-users"></i>
                            ${trajet.places_par_arret[lastIndex]} place${trajet.places_par_arret[lastIndex] > 1 ? 's' : ''} disponible${trajet.places_par_arret[lastIndex] > 1 ? 's' : ''}
                        </div>` : ''
                    }
                </div>
            </div>`;
    }
    
    return html;
}

// Fonction pour afficher le formulaire de mot-clé
function showSecretForm(trajetId, action) {
    // Masquer tous les autres formulaires ouverts
    document.querySelectorAll('.trajet-secret-form').forEach(form => {
        form.style.display = 'none';
    });
    
    // Afficher le formulaire correspondant à l'action
    if (action === 'mark') {
        document.getElementById(`secret-form-${trajetId}`).style.display = 'block';
    } else if (action === 'delete') {
        document.getElementById(`delete-form-${trajetId}`).style.display = 'block';
    }
}

// Fonction pour confirmer le marquage comme complet
async function confirmMarkComplet(festival_id, trajetId) {
    const secret = document.getElementById(`secret-input-${trajetId}`).value;
    if (!secret) {
        showNotification('Veuillez entrer le mot-clé secret', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/trajets/${festival_id}/complet`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ index: trajetId, secret })
        });
        
        const result = await response.json();
        if (result.error) {
            showNotification(result.error, 'error');
        } else {
            showNotification('Trajet marqué comme complet avec succès', 'success');
            loadTrajets(festival_id);
        }
    } catch (error) {
        console.error('Erreur lors du marquage comme complet:', error);
        showNotification('Une erreur est survenue', 'error');
    }
}

// Fonction pour confirmer la suppression d'un trajet
async function confirmDeleteTrajet(festival_id, trajetId) {
    const secret = document.getElementById(`delete-secret-${trajetId}`).value;
    if (!secret) {
        showNotification('Veuillez entrer le mot-clé secret', 'error');
        return;
    }
    
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce trajet ? Cette action est irréversible.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/trajets/${festival_id}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ index: trajetId, secret })
        });
        
        const result = await response.json();
        if (result.error) {
            showNotification(result.error, 'error');
        } else {
            showNotification('Trajet supprimé avec succès', 'success');
            loadTrajets(festival_id);
        }
    } catch (error) {
        console.error('Erreur lors de la suppression du trajet:', error);
        showNotification('Une erreur est survenue lors de la suppression', 'error');
    }
}

// Fonction pour contacter le conducteur
function contacterConducteur(contact) {
    if (!contact) {
        showNotification('Aucune information de contact disponible', 'error');
        return;
    }
    
    if (contact.includes('@')) {
        window.location.href = `mailto:${contact}?subject=Covoiturage Festival`;
    } else {
        window.location.href = `tel:${contact}`;
    }
}

async function markComplet(festival_id, trajetId) {
    try {
        const secret = document.getElementById(`secret-${trajetId}`).value;
        const response = await fetch(`/api/trajets/${festival_id}/complet`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ index: trajetId, secret })
        });
        
        const result = await response.json();
        if (result.error) {
            showNotification(result.error, 'error');
        } else {
            showNotification('Trajet marqué comme complet avec succès', 'success');
            loadTrajets(festival_id);
        }
    } catch (error) {
        console.error('Erreur lors du marquage comme complet:', error);
        showNotification('Une erreur est survenue', 'error');
    }
}

async function deleteTrajet(festival_id, trajetId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce trajet ? Cette action est irréversible.')) {
        return;
    }
    
    try {
        const secret = document.getElementById(`secret-${trajetId}`).value;
        const response = await fetch(`/api/trajets/${festival_id}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
            body: JSON.stringify({ index: trajetId, secret })
        });
        
        const result = await response.json();
        if (result.error) {
            showNotification(result.error, 'error');
        } else {
            showNotification('Trajet supprimé avec succès', 'success');
            loadTrajets(festival_id);
        }
    } catch (error) {
        console.error('Erreur lors de la suppression du trajet:', error);
        showNotification('Une erreur est survenue lors de la suppression', 'error');
    }
}

// Fonction pour ajouter un arrêt intermédiaire
function ajouterArretIntermediaire() {
    const arretsContainer = document.getElementById('arrets-container');
    if (!arretsContainer) return;

    const arretId = Date.now(); // ID unique pour l'arrêt
    
    const arretElement = document.createElement('div');
    arretElement.className = 'arret-intermediaire';
    arretElement.dataset.id = arretId;
    
    arretElement.innerHTML = `
        <div class="etape-container">
            <button type="button" class="supprimer-arret" data-arret-id="${arretId}" title="Supprimer cet arrêt">
                <i class="fas fa-times"></i>
            </button>
            <div class="form-group">
                <label>Arrêt intermédiaire</label>
                <input type="text" class="form-control adresse" placeholder="Adresse de l'arrêt" required>
            </div>
            <div class="form-group">
                <label>Heure de passage</label>
                <input type="time" class="form-control heure-passage" required>
            </div>
            <div class="form-group">
                <label>Places disponibles à cet arrêt</label>
                <input type="number" class="form-control places-arret" min="1" value="1" required>
            </div>
        </div>
    `;
    
    arretsContainer.appendChild(arretElement);
    
    // Ajouter l'événement de suppression
    const supprimerBtn = arretElement.querySelector('.supprimer-arret');
    if (supprimerBtn) {
        supprimerBtn.addEventListener('click', () => {
            arretElement.remove();
        });
    }
    
    return arretId;
}

// Gestionnaire d'événements pour le formulaire d'ajout de trajet
function setupTrajetForm() {
    const form = document.getElementById('trajet-form');
    const ajouterArretBtn = document.getElementById('ajouter-arret');
    
    if (!form) return;

    // Gérer l'ajout d'un arrêt intermédiaire
    if (ajouterArretBtn) {
        ajouterArretBtn.addEventListener('click', ajouterArretIntermediaire);
    }

    // Charger les détails du festival pour la date
    async function loadFestivalDetails() {
        const festivalId = new URLSearchParams(window.location.search).get('id');
        if (!festivalId) {
            showNotification('Erreur: Aucun festival sélectionné', 'error');
            return null;
        }

        try {
            const response = await fetch(`/api/festivals/${festivalId}`);
            if (!response.ok) throw new Error('Erreur lors du chargement des détails du festival');
            return await response.json();
        } catch (error) {
            console.error('Erreur:', error);
            showNotification('Impossible de charger les détails du festival', 'error');
            return null;
        }
    }

    // Initialiser le formulaire avec les dates du festival
    async function initializeForm() {
        const festival = await loadFestivalDetails();
        if (!festival) return;

        // Mettre à jour l'ID du festival dans le formulaire
        document.getElementById('festival-id').value = festival.id;
        
        // Mettre à jour le titre de la page avec le nom du festival
        const festivalTitle = document.getElementById('festival-nom');
        if (festivalTitle) {
            festivalTitle.textContent = festival.nom || 'Détails du festival';
        }

        // Récupérer les champs d'adresse
        const adresseInputs = document.querySelectorAll('.adresse');
        const departInput = adresseInputs[0]; // Premier champ (départ)
        const arriveeInput = adresseInputs[adresseInputs.length - 1]; // Dernier champ (arrivée)


        // Définir les dates min/max pour le champ de date
        const dateInput = document.getElementById('trajet-date');
        const festivalDate = new Date(festival.date);
        const today = new Date();
        
        // Si le festival est aujourd'hui ou dans le futur
        if (festivalDate >= today) {
            dateInput.min = formatDateForInput(festivalDate);
            dateInput.max = formatDateForInput(new Date(festivalDate.getTime() + 7 * 24 * 60 * 60 * 1000)); // Jusqu'à 7 jours après
        } else {
            // Pour les festivals passés, permettre des dates autour de la date du festival
            const dayAfter = new Date(festivalDate);
            dayAfter.setDate(dayAfter.getDate() + 1);
            dateInput.min = formatDateForInput(new Date(festivalDate.getTime() - 7 * 24 * 60 * 60 * 1000));
            dateInput.max = formatDateForInput(dayAfter);
        }

        // Fonction pour mettre à jour les champs en fonction du type de trajet
        function updateFormFields(isAller) {
            if (isAller) {
                // Trajet aller : départ -> festival
                departInput.placeholder = 'Votre adresse de départ';
                arriveeInput.value = festival.nom + (festival.lieu ? `, ${festival.lieu}` : '');
                dateInput.value = formatDateForInput(festivalDate);
            } else {
                // Trajet retour : festival -> domicile
                departInput.value = festival.nom + (festival.lieu ? `, ${festival.lieu}` : '');
                arriveeInput.placeholder = 'Votre adresse de retour';
                const nextDay = new Date(festivalDate);
                nextDay.setDate(nextDay.getDate() + 1);
                dateInput.value = formatDateForInput(nextDay);
            }
        }

        // Définir les valeurs initiales
        const trajetType = document.querySelector('input[name="trajet_type"]:checked').value;
        updateFormFields(trajetType === 'aller');
        
        // Mettre à jour les champs quand le type de trajet change
        document.querySelectorAll('input[name="trajet_type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                updateFormFields(e.target.value === 'aller');
            });
        });
    }

    // Formater la date pour l'input date (YYYY-MM-DD)
    function formatDateForInput(date) {
        const d = new Date(date);
        let month = '' + (d.getMonth() + 1);
        let day = '' + d.getDate();
        const year = d.getFullYear();

        if (month.length < 2) month = '0' + month;
        if (day.length < 2) day = '0' + day;

        return [year, month, day].join('-');
    }

    // Mettre à jour la date minimale/maximale lors du changement de type de trajet
    document.querySelectorAll('input[name="trajet_type"]').forEach(radio => {
        radio.addEventListener('change', async () => {
            const festival = await loadFestivalDetails();
            if (!festival) return;
            
            const festivalDate = new Date(festival.date);
            const dateInput = document.getElementById('trajet-date');
            
            if (radio.value === 'aller') {
                dateInput.value = formatDateForInput(festivalDate);
            } else {
                const nextDay = new Date(festivalDate);
                nextDay.setDate(nextDay.getDate() + 1);
                dateInput.value = formatDateForInput(nextDay);
            }
        });
    });

    // Initialiser le formulaire
    initializeForm();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const festivalId = document.getElementById('festival-id').value;
        if (!festivalId) {
            showNotification('Erreur: Aucun festival sélectionné', 'error');
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.innerHTML;
        
        try {
            // Désactiver le bouton pendant l'envoi
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi en cours...';

            // Récupérer les données du formulaire
            const typeTrajet = form.querySelector('input[name="trajet_type"]:checked').value;
            const adresses = [];
            const heures = [];
            const placesParArret = [];

            // Récupérer le point de départ
            const etapeDepart = form.querySelector('.etape-container:first-of-type');
            adresses.push(etapeDepart.querySelector('.adresse').value);
            heures.push(etapeDepart.querySelector('.heure-depart').value);
            const placesDepart = parseInt(document.getElementById('places').value, 10);
            placesParArret.push(placesDepart);

            // Récupérer les arrêts intermédiaires
            const arrets = form.querySelectorAll('.arret-intermediaire');            
            arrets.forEach(arret => {
                const adresse = arret.querySelector('.adresse').value;
                const heure = arret.querySelector('.heure-passage').value;
                const places = parseInt(arret.querySelector('.places-arret').value, 10);
                
                if (adresse && heure) {
                    adresses.push(adresse);
                    heures.push(heure);
                    placesParArret.push(places);
                }
            });

            // Récupérer le point d'arrivée
            const etapeArrivee = form.querySelector('.etape-container:last-of-type');
            adresses.push(etapeArrivee.querySelector('.adresse').value);
            heures.push(etapeArrivee.querySelector('.heure-arrivee').value);
            placesParArret.push(placesDepart); // Même nombre de places qu'au départ

            // Vérifier qu'il y a au moins un point de départ et d'arrivée
            if (adresses.length < 2) {
                throw new Error('Veuillez spécifier au moins un point de départ et une destination');
            }

            // Préparer les données du trajet
            const trajetData = {
                festival_id: parseInt(festivalId, 10),
                type: typeTrajet,
                adresses: adresses,
                heures: heures,
                places_par_arret: placesParArret,
                places_disponibles: Math.min(...placesParArret), // Le nombre de places disponibles est le minimum des places par arrêt
                date_trajet: document.getElementById('trajet-date').value,
                commentaires: document.getElementById('commentaires').value,
                contact: document.getElementById('contact').value,
                secret: document.getElementById('secret').value,
                date_creation: new Date().toISOString()
            };

            console.log('Données du trajet à envoyer:', trajetData);

            // Envoyer les données au serveur
            const response = await fetch('/api/trajets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(trajetData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Erreur lors de l\'ajout du trajet');
            }
            
            // Réinitialiser le formulaire
            form.reset();
            document.getElementById('arrets-container').innerHTML = ''; // Supprimer les arrêts ajoutés
            showNotification('Trajet ajouté avec succès !', 'success');
            
            // Recharger la liste des trajets
            await loadTrajets(festivalId);
            
            // Fermer le formulaire
            const trajetFormContainer = document.getElementById('trajet-form-container');
            const showTrajetFormBtn = document.getElementById('show-trajet-form');
            if (trajetFormContainer && showTrajetFormBtn) {
                trajetFormContainer.style.display = 'none';
                showTrajetFormBtn.style.display = 'inline-flex';
            }
            
        } catch (error) {
            console.error('Erreur lors de l\'ajout du trajet:', error);
            showNotification(error.message || 'Une erreur est survenue lors de l\'ajout du trajet', 'error');
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
