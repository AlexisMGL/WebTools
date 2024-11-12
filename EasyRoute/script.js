document.getElementById('processButton').addEventListener('click', processFile);

// Fonction pour traiter le fichier
// Fonction pour traiter le fichier
function processFile() {
    const inputFile = document.getElementById('inputFile').files[0];

    if (!inputFile) {
        alert('Veuillez selectionner un fichier à traiter.');
        return;
    }

    const minDistanceInput = document.getElementById('minDistance').value; // Récupérer la distance minimum depuis l'input
    const minDistance = parseFloat(minDistanceInput); // Convertir en nombre

    if (!inputFile) {
        alert('Veuillez selectionner un fichier à traiter.');
        return;
    }

    if (isNaN(minDistance) || minDistance <= 0) {
        alert('Veuillez entrer une distance minimum valide.');
        return;
    }

    const outputFileName = 'route.waypoints'; // Nom du fichier de sortie

    // Lire le fichier d'entrée
    const reader = new FileReader();
    reader.onload = function (event) {
        const data = event.target.result;
        const lines = data.split('\n');
        const waypoints = [];
        const outputLines = ["QGC WPL 110"]; // En-tête pour QGroundControl

        // Copier les 7 premières lignes directement dans la sortie
        for (let i = 0; i < Math.min(7, lines.length); i++) {
            outputLines.push(lines[i]);
        }

        // Parcourir chaque ligne du fichier à partir de la 8e ligne
        for (let i = 7; i < lines.length - 7; i++) {
            const line = lines[i].trim();
            const data = line.split('\t').map(Number); // Utiliser tabulation comme délimiteur

            if (data.length > 0) {
                console.log(`Traitement de la ligne ${i}: ${line}`);
                console.log(`Données traitées:`, data);

                // Vérifier si la ligne est un waypoint (command 16 est NAV_WAYPOINT)
                if (data.length > 4 && data[3] === 16) {
                    const lat = data[8]; // Latitude
                    const lon = data[9]; // Longitude
                    console.log(`Waypoint à la ligne ${i}: lat=${lat}, lon=${lon}`);

                    // Vérifier la distance par rapport au dernier waypoint
                    if (waypoints.length === 0) {
                        // Premier waypoint
                        waypoints.push({ lat, lon, line });
                        outputLines.push(line); // Ajouter à la sortie
                        console.log(`Ajouté le premier waypoint à la ligne ${i}`);
                    } else {
                        // Calculer la distance au dernier waypoint
                        const prevWaypoint = waypoints[waypoints.length - 1];
                        const distance = haversine(prevWaypoint.lat, prevWaypoint.lon, lat, lon);
                        console.log(`Distance au waypoint précédent: ${distance} mètres`);

                        if (distance >= minDistance) {
                            waypoints.push({ lat, lon, line });
                            outputLines.push(line); // Ajouter à la sortie
                            console.log(`Ajouté le waypoint à la ligne ${i}: lat=${lat}, lon=${lon}`);
                        } else {
                            console.log(`Waypoint à la ligne ${i} est trop proche du précédent. Ignoré.`);
                        }
                    }
                } else {
                    console.log(`Non-waypoint à la ligne ${i}: ${line}`);
                    // Ajouter directement les lignes non-waypoint à la sortie
                    outputLines.push(line);
                }
            } else {
                console.log(`Ignorer la ligne vide ou invalide à ${i}`);
            }
        }

        // Copier les 7 dernières lignes directement dans la sortie
        for (let i = lines.length - 7; i < lines.length; i++) {
            if (i < lines.length) {
                outputLines.push(lines[i]);
            }
        }

        // Vérifiez le contenu des outputLines avant de télécharger
        console.log('Contenu des lignes de sortie :', outputLines);

        // Écrire dans le fichier de sortie
        downloadFile(outputLines.join('\n'), outputFileName); // Créer le fichier de sortie

        // Ajouter ce bloc après avoir terminé de traiter la liste des waypoints

        // Initialiser la carte
        const mapDiv = document.createElement('div');
        mapDiv.id = 'map';
        mapDiv.style.height = '1000px';
        mapDiv.style.width = '100%';
        document.body.appendChild(mapDiv);

        const map = L.map('map').setView([waypoints[0].lat, waypoints[0].lon], 13); // Centrer sur le premier waypoint
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18
        }).addTo(map);

        // Ajouter les waypoints en tant que marqueurs
        waypoints.forEach(wp => {
            L.marker([wp.lat, wp.lon]).addTo(map).bindPopup(`Lat: ${wp.lat}, Lon: ${wp.lon}`);
        });

        // Tracer la polyligne pour visualiser la route
        L.polyline(waypoints.map(wp => [wp.lat, wp.lon]), { color: 'blue' }).addTo(map);

        // Centrer la carte pour inclure tous les waypoints
        const bounds = L.latLngBounds(waypoints.map(wp => [wp.lat, wp.lon]));
        map.fitBounds(bounds);
        document.getElementById('map').style.display = 'block';


    };

    reader.readAsText(inputFile);
}


// Fonction pour calculer la distance entre deux coordonnées GPS (Haversine)
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Rayon de la Terre en mètres
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance en mètres
}

// Fonction pour convertir les degrés en radians
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Fonction pour télécharger le fichier de sortie
function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.getElementById('downloadLink');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = 'block';
    link.innerText = 'Telecharger le fichier reduit';
}
