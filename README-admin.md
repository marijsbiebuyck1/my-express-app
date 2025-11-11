# Admin server (asielen)

Dit bestand beschrijft hoe je de aparte admin/shelter server ("asielen") start zonder bestaande bestanden in het project aan te passen.

## Doel

Een aparte Express-entrypoint (`app-admin.js`) die de nieuwe `routes/asielen.js` gebruikt en de `models/Shelter.js` definieert. Hierdoor blijft de bestaande `app.js` ongewijzigd en werkt de bestaande gebruikers backend zoals voorheen.

## Run

Zorg dat je environment variable `MONGO_URI` is ingesteld (zoals voor de hoofd-app). Optioneel kun je `ADMIN_PORT` instellen; standaard luistert de admin server op 3002.

Start de admin server met:

```bash
# vanaf de project root
node app-admin.js
```

## Endpoints (basis)

- GET /asielen — lijst van alle shelters (zonder passwordHash)
- GET /asielen/:id — details van 1 shelter
- POST /asielen — create shelter (body: name, email, password, ...)
- PATCH /asielen/:id — update shelter (partial)
- POST /asielen/:id/avatar — upload profielafbeelding (multipart/form-data 'avatar')

## Opmerkingen

- De nieuwe bestanden veranderen niks aan de bestaande user-routes of models.
- Bestanden die zijn toegevoegd: `models/Shelter.js`, `routes/asielen.js`, `app-admin.js`, `README-admin.md`.
