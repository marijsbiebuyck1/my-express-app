# Project structure: gebruikers vs admin (asielen)

## Doel

Een duidelijke, visuele scheiding tussen "gebruiker"-code en "admin/asiel"-code zonder bestaande bestanden inhoudelijk te wijzigen of bestaande imports te breken.

## Wat is toegevoegd

- `models/users/User.js` — re-export van `models/User.js` zodat alle user-modellen zichtbaar zijn in `models/users/`.
- `models/admin/Shelter.js` — re-export van `models/Shelter.js` zodat alle admin/asiel-modellen zichtbaar zijn in `models/admin/`.
- `routes/users/index.js` — re-export van `routes/users.js` zodat alle user-routes zichtbaar zijn in `routes/users/`.
- `routes/admin/asielen.js` — re-export van `routes/asielen.js` zodat alle admin-routes zichtbaar zijn in `routes/admin/`.

## Waarom dit zo is gedaan

- Jij vroeg expliciet dat bestaande bestanden niet inhoudelijk aangepast mogen worden. Verplaatsen zou imports (bijv. `import userRouter from './routes/users.js'` in `app.js`) breken. Daarom gebruiken we re-export bestanden: je krijgt de mappenstructuur en overzicht zonder dat bestaande import-paden hoeven te veranderen.
- Deze aanpak maakt het later makkelijker om veilig te refactoren of te verplaatsen: je kunt de originele modules stap-voor-stap vervangen door de nieuwe locatie en uiteindelijk de wrapper verwijderen.

## Hoe te gebruiken

- Voor overzicht: open `models/users/User.js` en `routes/admin/asielen.js` — ze verwijzen terug naar de originele bestanden.
- Je kunt nu in je editor de folders `models/users`, `models/admin`, `routes/users`, `routes/admin` gebruiken om snel te navigeren naar user- of admin-gerelateerde code.

## Volgende stappen (optioneel)

- Indien je wilt, kan ik de originele bestanden geleidelijk verplaatsen naar de nieuwe mappen en wrapper-bestanden aanpassen om directe imports te gebruiken. Dit vereist het aanpassen van alle import-paden waar de originals gebruikt worden (ik kan dat automatisch doen).
- Voeg een lintregel of project conventie toe zodat toekomstige files direct in de juiste map worden gemaakt.
