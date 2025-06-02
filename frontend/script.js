// Variables globales
window.currentFestivalId = null;

// Fonction pour ouvrir la modale de contact
async function openContactModal(driverId, trajetId) {
    // Créer la modale
    const modal = document.createElement('div');
    modal.className = 'contact-modal';
    
    // Récupérer les détails du trajet pour obtenir le nombre de places disponibles
    let placesDisponibles = 1;
    try {
        const response = await fetch(`/api/trajets`);
        if (response.ok) {
            const trajets = await response.json();
            const trajet = trajets.find(t => t.id == trajetId); // Utilisation de == au lieu de === pour la comparaison
            if (trajet) {
                // Récupérer les places disponibles depuis l'API
                const placesResponse = await fetch(`/api/places-disponibles/${trajetId}`);
                if (placesResponse.ok) {
                    const data = await placesResponse.json();
                    placesDisponibles = data.places_restantes || 1;
                } else {
                    // En cas d'erreur, utiliser la valeur du trajet
                    placesDisponibles = parseInt(trajet.places_disponibles) || 1;
                }
            }
        }
    } catch (error) {
        console.error('Erreur lors de la récupération des détails du trajet:', error);
    }
    
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-modal">&times;</span>
            <h3>Contacter le conducteur</h3>
            <form id="contactForm">
                <input type="hidden" id="driverId" value="${driverId}">
                <input type="hidden" id="trajetId" value="${trajetId}">
                <div class="form-group">
                    <label for="contactName">Votre nom complet*</label>
                    <input type="text" id="contactName" required>
                </div>
                <div class="form-group">
                    <label for="contactEmail">Votre email*</label>
                    <input type="email" id="contactEmail" required>
                </div>
                <div class="form-group">
                    <label for="contactPhone">Votre téléphone*</label>
                    <input type="tel" id="contactPhone" 
                           pattern="^\\+[0-9]{1,3}[0-9]{8,15}$" 
                           title="Format: +indicatifnuméro (ex: +3248420010)" 
                           required>
                </div>
                <div class="form-group">
                    <label for="contactPlaces">Nombre de places demandées*</label>
                    <input type="number" id="contactPlaces" 
                           min="1" 
                           max="${placesDisponibles}" 
                           value="1" 
                           required>
                    <small class="form-text text-muted">Places disponibles: <span id="places-available">${placesDisponibles}</span></small>
                </div>
                <div class="form-group">
                    <label for="contactMessage">Message (facultatif)</label>
                    <textarea id="contactMessage" rows="4"></textarea>
                </div>
                <button type="submit" class="btn btn-primary">Envoyer la demande</button>
            </form>
        </div>
    `;
    
    // Ajouter la modale à la page
    document.body.appendChild(modal);
    modal.style.display = 'block';

    // Gestion de la fermeture de la modale
    modal.querySelector('.close-modal').onclick = () => modal.remove();
    window.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    // Gestion de la soumission du formulaire
    const form = modal.querySelector('#contactForm');
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        const placesDemandees = parseInt(document.getElementById('contactPlaces').value);
        const placesDisponibles = parseInt(document.getElementById('places-available').textContent);
        
        // Validation du nombre de places demandées
        if (placesDemandees < 1 || placesDemandees > placesDisponibles) {
            showNotification(`Veuillez sélectionner entre 1 et ${placesDisponibles} places.`, 'error');
            return;
        }
        
        const formData = {
            driverId: document.getElementById('driverId').value,
            trajetId: document.getElementById('trajetId').value,
            name: document.getElementById('contactName').value,
            email: document.getElementById('contactEmail').value,
            phone: document.getElementById('contactPhone').value,
            places_demandees: placesDemandees,
            message: document.getElementById('contactMessage').value
        };

        try {
            const response = await fetch('/api/contact-request', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });
            
            if (response.ok) {
                showNotification('Votre demande a été envoyée avec succès !', 'success');
                modal.remove();
                
                // Recharger la liste des trajets pour mettre à jour les places disponibles
                if (currentFestivalId) {
                    await loadTrajets(currentFestivalId);
                }
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Une erreur est survenue');
            }
        } catch (error) {
            console.error('Erreur:', error);
            showNotification(error.message || 'Une erreur est survenue', 'error');
        }
    };
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
    // Mettre à jour l'ID du festival courant
    window.currentFestivalId = festival_id;
    
    const trajetsContainer = document.getElementById('trajets');
    if (!trajetsContainer) {
        console.error('Conteneur des trajets non trouvé');
        return;
    }

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
                        <button class="btn btn-sm ${isComplet ? 'btn-outline' : 'btn-primary'}" 
                                onclick="${isComplet ? 'event.preventDefault();' : `openContactModal('${trajet.conducteur_id || 'unknown'}', '${trajet.id}')`}"
                                ${isComplet ? 'disabled' : ''}>
                            <i class="fas fa-${isComplet ? 'ban' : 'envelope'}"></i> ${isComplet ? 'Complet' : 'Contacter'}
                        </button>
                        <div class="trajet-secret-form" id="secret-form-${trajet.id}" style="display: none; margin-top: 10px;">
                            <input type="password" id="secret-input-${trajet.id}" class="form-control form-control-sm" placeholder="Mot-clé secret" style="margin-bottom: 5px;">
                            <div class="d-flex gap-2">
                                <button class="btn btn-sm btn-primary confirm-btn" 
        onclick="confirmMarkComplet(${festival_id}, '${trajet.id}')">
    <i class="fas fa-check-double"></i> Confirmer
</button>
                                <button class="btn btn-sm btn-outline" onclick="event.preventDefault(); document.getElementById('secret-form-${trajet.id}').style.display = 'none';">
                                    <i class="fas fa-times"></i> Annuler
                                </button>
                            </div>
                        </div>
                        ${isComplet ? `
                        <button class="btn btn-sm btn-success" 
                                onclick="event.preventDefault(); showSecretForm('${trajet.id}', 'reopen')">
                            <i class="fas fa-redo"></i> Rendre disponible
                        </button>` : `
                        <button class="btn btn-sm btn-primary" 
                                onclick="event.preventDefault(); showSecretForm('${trajet.id}', 'mark')">
                            <i class="fas fa-check-double"></i> Marquer complet
                        </button>`}
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
                        <button class="btn btn-sm btn-outline-primary" 
                                onclick="event.preventDefault(); showUpdatePlacesForm('${trajet.id}', ${trajet.places_disponibles || 1}, ${festival_id})">
                            <i class="fas fa-user-edit"></i> Modifier places
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
    const isRetour = trajet.type === 'retour';
    
    // Déterminer l'ordre d'affichage en fonction du type de trajet
    const indices = isRetour 
        ? Array.from({length: totalEtapes}, (_, i) => totalEtapes - 1 - i) // Ordre inverse pour les retours
        : Array.from({length: totalEtapes}, (_, i) => i); // Ordre normal pour les allers
    
    // Ajouter chaque étape dans l'ordre déterminé
    indices.forEach((index, i) => {
        const adresse = trajet.adresses[index];
        const heure = trajet.heures[index];
        const places = trajet.places_par_arret ? trajet.places_par_arret[index] : undefined;
        
        if (!adresse) return;
        
        // Déterminer le type d'étape (départ, intermédiaire, arrivée)
        let etapeClass = 'arret';
        let iconClass = 'fa-map-marker-alt';
        
        if (i === 0) {
            etapeClass = 'depart';
            iconClass = isRetour ? 'fa-flag-checkered' : 'fa-flag';
        } else if (i === indices.length - 1) {
            etapeClass = 'arrivee';
            iconClass = isRetour ? 'fa-flag' : 'fa-flag-checkered';
        }
        
        // Ajouter l'étape au HTML
        html += `
            <div class="etape ${etapeClass}">
                <div class="etape-point">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="etape-details">
                    <div class="etape-heure">${formatTime(heure)}</div>
                    <div class="etape-lieu">${adresse}</div>
                    ${places !== undefined ? `
                        <div class="etape-places">
                            <i class="fas fa-users"></i>
                            ${places} place${places > 1 ? 's' : ''} disponible${places > 1 ? 's' : ''}
                        </div>` : ''
                    }
                </div>
            </div>`;
    });
    
    return html;
}

// Fonction pour afficher le formulaire de mot-clé
function showSecretForm(trajetId, action) {
    // Masquer tous les formulaires ouverts
    document.querySelectorAll('.trajet-secret-form').forEach(form => {
        form.style.display = 'none';
    });
    
    // Afficher le formulaire correspondant à l'action
    if (action === 'mark' || action === 'reopen') {
        const form = document.getElementById(`secret-form-${trajetId}`);
        form.style.display = 'block';
        
        // Mettre à jour le bouton de confirmation en fonction de l'action
        const confirmBtn = form.querySelector('.confirm-btn');
        if (confirmBtn) {
            if (action === 'reopen') {
                confirmBtn.innerHTML = '<i class="fas fa-redo"></i> Rendre disponible';
                confirmBtn.onclick = (e) => {
                    e.preventDefault();
                    markAsAvailable(trajetId, festival_id);
                };
            } else {
                confirmBtn.innerHTML = '<i class="fas fa-check-double"></i> Confirmer';
                confirmBtn.onclick = (e) => {
                    e.preventDefault();
                    confirmMarkComplet(festival_id, trajetId);
                };
            }
        }
    } else if (action === 'delete') {
        document.getElementById(`delete-form-${trajetId}`).style.display = 'block';
    }
}

// Fonction pour afficher le formulaire de modification des places
function showUpdatePlacesForm(trajetId, currentPlaces, festivalId) {
    console.log('Appel de showUpdatePlacesForm avec trajetId:', trajetId, 'et places:', currentPlaces);
    
    try {
        // Masquer tous les autres formulaires
        document.querySelectorAll('.trajet-secret-form').forEach(form => {
            form.style.display = 'none';
        });
        
        // Récupérer le conteneur des actions et le conteneur parent
        const trajetCard = document.querySelector(`[data-trajet-id="${trajetId}"]`);
        if (!trajetCard) {
            console.error('Carte de trajet non trouvée pour l\'ID:', trajetId);
            return;
        }
        
        const actionsContainer = trajetCard.querySelector('.trajet-actions');
        if (!actionsContainer) {
            console.error('Conteneur des actions non trouvé pour le trajet ID:', trajetId);
            return;
        }
        
        // Utiliser le festivalId passé en paramètre ou la variable globale
        festivalId = festivalId || window.currentFestivalId || 0;
        
        // Créer ou afficher le formulaire
        let form = document.getElementById(`update-places-form-${trajetId}`);
        if (!form) {
            console.log('Création du formulaire de modification des places');
            form = document.createElement('div');
            form.id = `update-places-form-${trajetId}`;
            form.className = 'trajet-secret-form';
            form.style.marginTop = '10px';
            
            form.innerHTML = `
                <div class="d-flex flex-column gap-2">
                    <div class="d-flex align-items-center gap-2">
                        <input type="number" id="places-input-${trajetId}" 
                               class="form-control form-control-sm" 
                               value="${currentPlaces}" min="1" style="width: 80px;">
                        <button class="btn btn-sm btn-primary" 
                                onclick="confirmUpdatePlaces('${trajetId}', ${festivalId})">
                            <i class="fas fa-save"></i> Valider
                        </button>
                        <button class="btn btn-sm btn-outline" 
                                onclick="event.preventDefault(); this.closest('.trajet-secret-form').style.display = 'none';">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="secret-update-places-${trajetId}" style="display: none; margin-top: 5px;">
                        <input type="password" id="secret-input-update-${trajetId}" 
                               class="form-control form-control-sm" 
                               placeholder="Mot-clé secret" style="margin-bottom: 5px;">
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-primary" 
                                    onclick="updateTrajetPlaces('${trajetId}', ${festivalId})">
                                <i class="fas fa-check"></i> Confirmer
                            </button>
                            <button class="btn btn-sm btn-outline" 
                                    onclick="document.getElementById('secret-update-places-${trajetId}').style.display = 'none';">
                                <i class="fas fa-times"></i> Annuler
                            </button>
                        </div>
                    </div>
                </div>
            `;
            actionsContainer.appendChild(form);
            console.log('Formulaire ajouté au DOM');
        }
        form.style.display = 'block';
        console.log('Affichage du formulaire');
    } catch (error) {
        console.error('Erreur dans showUpdatePlacesForm:', error);
    }
}

// Fonction pour confirmer la modification des places
function confirmUpdatePlaces(trajetId, festivalId) {
    const placesInput = document.getElementById(`places-input-${trajetId}`);
    const places = parseInt(placesInput.value);
    
    if (isNaN(places) || places < 1) {
        showNotification('Veuillez entrer un nombre de places valide (au moins 1)', 'error');
        return;
    }
    
    // Afficher le champ de mot de passe
    const secretDiv = document.getElementById(`secret-update-places-${trajetId}`);
    if (secretDiv) {
        secretDiv.style.display = 'block';
        // Faire défendre jusqu'au champ de mot de passe
        secretDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Fonction pour mettre à jour le nombre de places d'un trajet
async function updateTrajetPlaces(trajetId, festivalId) {
    const placesInput = document.getElementById(`places-input-${trajetId}`);
    const secretInput = document.getElementById(`secret-input-update-${trajetId}`);
    const newPlaces = parseInt(placesInput.value);
    const secret = secretInput ? secretInput.value : '';
    
    if (isNaN(newPlaces) || newPlaces < 1) {
        showNotification('Veuillez entrer un nombre de places valide (au moins 1)', 'error');
        return;
    }
    
    if (!secret) {
        showNotification('Veuillez entrer le mot-clé secret', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/trajets/${festivalId}/update-places`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true' 
            },
            body: JSON.stringify({ 
                trajet_id: trajetId,
                places: newPlaces,
                secret: secret
            })
        });
        
        const result = await response.json();
        if (result.error) {
            throw new Error(result.error);
        }
        
        showNotification(result.message || 'Nombre de places mis à jour avec succès', 'success');
        
        // Recharger la liste des trajets
        loadTrajets(festivalId);
        
        // Masquer le formulaire de modification
        const form = document.getElementById(`update-places-form-${trajetId}`);
        if (form) {
            form.style.display = 'none';
        }
    } catch (error) {
        console.error('Erreur lors de la mise à jour des places:', error);
        showNotification(error.message || 'Une erreur est survenue lors de la mise à jour des places', 'error');
    }
}

// Fonction pour marquer un trajet comme disponible à nouveau
async function markAsAvailable(trajetId, festivalId) {
    const secret = document.getElementById(`secret-input-${trajetId}`).value;
    if (!secret) {
        showNotification('Veuillez entrer le mot-clé secret', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/trajets/${festivalId}/reopen`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true' 
            },
            body: JSON.stringify({ 
                trajet_id: trajetId,
                secret: secret
            })
        });
        
        const result = await response.json();
        if (result.error) {
            throw new Error(result.error);
        }
        
        showNotification('Le trajet est à nouveau disponible', 'success');
        loadTrajets(festivalId);
    } catch (error) {
        console.error('Erreur lors de la réouverture du trajet:', error);
        showNotification(error.message || 'Une erreur est survenue', 'error');
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
    const secretInput = document.getElementById(`delete-secret-${trajetId}`);
    if (!secretInput) {
        showNotification('Erreur: Impossible de trouver le champ de mot-clé', 'error');
        return;
    }
    
    const secret = secretInput.value.trim();
    if (!secret) {
        showNotification('Veuillez entrer le mot-clé secret', 'error');
        return;
    }
    
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce trajet ? Cette action est irréversible.')) {
        return;
    }
    
    try {
        // Récupérer l'index du trajet dans la liste des trajets du festival
        const responseList = await fetch(`/api/trajets/${festival_id}`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const trajets = await responseList.json();
        
        // Trouver l'index du trajet à supprimer
        const trajetIndex = trajets.findIndex(t => t.id === trajetId);
        if (trajetIndex === -1) {
            throw new Error('Trajet introuvable');
        }
        
        // Envoyer la requête de suppression avec l'index
        const response = await fetch(`/api/trajets/${festival_id}/delete`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'ngrok-skip-browser-warning': 'true' 
            },
            body: JSON.stringify({ 
                index: trajetIndex, 
                secret: secret 
            })
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Erreur lors de la suppression du trajet');
        }
        
        showNotification('Trajet supprimé avec succès', 'success');
        // Recharger la liste des trajets
        await loadTrajets(festival_id);
        
    } catch (error) {
        console.error('Erreur lors de la suppression du trajet:', error);
        showNotification(error.message || 'Une erreur est survenue lors de la suppression', 'error');
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

    // Initialiser le formulaire au chargement
    initializeForm().catch(error => {
        console.error('Erreur lors de l\'initialisation du formulaire:', error);
        showNotification('Erreur lors du chargement des détails du festival', 'error');
    });

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
                departInput.value = ''; // Vider le champ de départ
                arriveeInput.value = festival.nom + (festival.lieu ? `, ${festival.lieu}` : '');
                arriveeInput.placeholder = ''; // Enlever le placeholder de l'arrivée
                dateInput.value = formatDateForInput(festivalDate);
            } else {
                // Trajet retour : festival -> domicile
                departInput.value = festival.nom + (festival.lieu ? `, ${festival.lieu}` : '');
                departInput.placeholder = ''; // Enlever le placeholder du départ
                arriveeInput.value = ''; // Vider le champ d'arrivée
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
            const places = parseInt(document.getElementById('places').value);
            const commentaires = document.getElementById('commentaires').value;
            const contactEmail = document.getElementById('contact-email').value;
            const contactPhone = document.getElementById('contact-phone').value;
            const secret = document.getElementById('secret').value;
            const festivalId = document.getElementById('festival-id').value;
            
            // Valider le format du numéro de téléphone
            const phonePattern = /^\+[0-9]{1,3}[0-9]{8,15}$/;
            if (!phonePattern.test(contactPhone)) {
                showNotification('Veuillez entrer un numéro de téléphone valide (ex: +3248420010)', 'error');
                return;
            }

            // Récupérer les étapes du trajet
            const etapes = [];
            const etapeContainers = form.querySelectorAll('.etape-container');
            let placesDisponibles = places; // Initialiser avec le nombre de places du formulaire
            
            etapeContainers.forEach((container, index) => {
                const adresse = container.querySelector('.adresse').value;
                let heure = '';
                
                // Trouver le champ d'heure approprié selon le type d'étape
                if (index === 0) {
                    heure = container.querySelector('.heure-depart').value;
                } else if (index === etapeContainers.length - 1) {
                    heure = container.querySelector('.heure-arrivee').value;
                } else {
                    heure = container.querySelector('.heure-passage').value;
                }
                
                if (adresse && heure) {
                    etapes.push({ adresse, heure });
                } else {
                    throw new Error('Veuillez remplir toutes les étapes du trajet');
                }
            });

            // Vérifier qu'il y a au moins un point de départ et d'arrivée
            if (etapes.length < 2) {
                throw new Error('Veuillez spécifier au moins un point de départ et une destination');
            }

            // Préparer les données du trajet
            const trajetData = {
                festival_id: festivalId,
                type: typeTrajet,
                adresses: etapes.map(e => e.adresse),
                heures: etapes.map(e => e.heure),
                places_par_arret: Array(etapes.length).fill(places), // Même nombre de places pour tous les arrêts
                places_disponibles: places,
                date_trajet: document.getElementById('trajet-date').value,
                commentaires,
                contact: contactEmail,
                telephone: contactPhone,
                secret,
                date_creation: new Date().toISOString()
            };

            console.log('Données du trajet à envoyer:', trajetData);

            console.log('Envoi des données du trajet au serveur...');
            // Envoyer les données au serveur
            const response = await fetch('/api/trajets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(trajetData)
            });

            const responseData = await response.json().catch(() => ({}));
            
            if (!response.ok) {
                console.error('Erreur serveur:', response.status, responseData);
                throw new Error(responseData.error || `Erreur ${response.status}: ${response.statusText}`);
            }
            
            console.log('Réponse du serveur:', responseData);
            
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
