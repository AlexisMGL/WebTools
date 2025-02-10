document.addEventListener('DOMContentLoaded', function () {
    const heures = [];
    for (let i = 7; i <= 17; i++) {
        for (let j = 0; j < 60; j += 15) {
            const heure = `${i.toString().padStart(2, '0')}:${j.toString().padStart(2, '0')}`;
            heures.push(heure);
        }
    }

    const projets = {
        "1.Largage": ["1.a Amortissement de la chute", "1.d Augmentation du volume", "1.e Train retractable"],
        "2.Fiabilisation_materielle": ["2.b Allègement Savior", "2.c Integration ADSB", "2.d MovingBaseline"],
        "3.Fiabilisation_logicielle": ["3.a Simplification MissionPlanner", "3.b Consignes parachute", "3.c Redondance Pitots", "3.d Geofencing", "3.f IntegrationAMMavroute", "3.h SmartRTL", "3.i Mise à jour fw"],
        "4.Liaison_bidirectionnelles": ["4.a POD", "4.b Gestion LATO", "4.c ESCs/servos monitores", "4.d Retour Vid", "4.e Coaxial", "4.f PrecLand", "4.y Autres", "4.h Smart RTL"],
        "5.Autres_fonctionnalites_cargo": ["5.a Formation des pilotes", "5.b Tests en operations", "5.c Integration sur un TOP"],
        "6.Ergonomie": ["6.a Conception fuselage ergonomique", "6.b Ergonomie Platine et PCB", "6.c Nouveaux connecteurs", "6.d Remplacement des batteries rapide"]
    };

    function populateSelect(select, options) {
        select.innerHTML = "";
        options.forEach(optionText => {
            const option = document.createElement('option');
            option.value = optionText;
            option.textContent = optionText;
            select.appendChild(option);
        });
    }

    function initializeRow(row) {
        const startSelect = row.querySelector('select[name="start"]');
        const endSelect = row.querySelector('select[name="end"]');
        const projet1Select = row.querySelector('select[name="projet_1"]');
        const projet2Select = row.querySelector('select[name="projet_2"]');

        populateSelect(startSelect, heures);
        populateSelect(endSelect, heures);
        populateSelect(projet1Select, Object.keys(projets));

        projet1Select.addEventListener('change', function () {
            const selectedProjet1 = projet1Select.value;
            populateSelect(projet2Select, projets[selectedProjet1] || []);
        });

        projet1Select.dispatchEvent(new Event('change'));
    }

    document.querySelectorAll('#tachesBody tr').forEach(initializeRow);

    window.addRow = function (button) {
        const row = button.closest('tr');
        const endTime = row.querySelector('select[name="end"]').value;

        row.classList.add('added');
        button.textContent = 'Supprimer';
        button.onclick = function () { removeRow(this); };

        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td><select name="start" required></select></td>
            <td><select name="end" required></select></td>
            <td><select name="projet_1" required></select></td>
            <td><select name="projet_2" required></select></td>
            <td><button type="button" onclick="addRow(this)">Ajouter</button></td>
        `;

        document.getElementById('tachesBody').appendChild(newRow);
        initializeRow(newRow);

        newRow.querySelector('select[name="start"]').value = endTime;
        newRow.querySelector('select[name="end"]').value = endTime;
    };

    window.removeRow = function (button) {
        const row = button.closest('tr');
        row.parentNode.removeChild(row);
    };

    document.getElementById('tachesForm').addEventListener('submit', function (event) {
        event.preventDefault();

        const rows = document.querySelectorAll('#tachesBody tr.added');
        const data = [];

        rows.forEach(row => {
            const start = row.querySelector('select[name="start"]').value;
            const end = row.querySelector('select[name="end"]').value;
            const projet_1 = row.querySelector('select[name="projet_1"]').value;
            const projet_2 = row.querySelector('select[name="projet_2"]').value;

            data.push({
                start: start,
                end: end,
                projet_1: projet_1,
                projet_2: projet_2
            });
        });

        fetch('https://api.sheetmonkey.io/form/YOUR_FORM_ID', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
            .then(response => response.json())
            .then(data => {
                console.log('Success:', data);
                alert('Donnees soumises avec succes !');
            })
            .catch((error) => {
                console.error('Error:', error);
                alert('Erreur lors de la soumission des donnees.');
            });
    });
});
