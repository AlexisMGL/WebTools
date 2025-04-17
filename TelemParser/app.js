// app.js

document.getElementById('fileItem').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const sec = document.getElementById('vibrationsSection');
  const out = document.getElementById('vibrationsContent');
  sec.hidden = false;
  out.textContent = 'Analyse en cours…';

  try {
    // 1) Lire et encoder en base64
    const buffer = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    // 2) Envoyer à la Netlify Function
    const res = await fetch('../netlify/functions/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tlog: b64 })
    });
    const json = await res.json();

    if (json.error) {
      out.textContent = 'Erreur : ' + json.error;
      return;
    }

    // 3) Afficher les résultats
    const v = json.vibration;
    out.innerHTML =
      `<p>Max X        : ${v.maxX?.toFixed(3)  ?? '—'} m/s²</p>` +
      `<p>Max Y        : ${v.maxY?.toFixed(3)  ?? '—'} m/s²</p>` +
      `<p>Max Z        : ${v.maxZ?.toFixed(3)  ?? '—'} m/s²</p>` +
      `<p>Max clipping : ${v.maxClipping} counts</p>`;

  } catch (err) {
    out.textContent = 'Échec réseau : ' + err.message;
  }
});
