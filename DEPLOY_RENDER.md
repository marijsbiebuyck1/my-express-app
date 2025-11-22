Deploying to Render (quick steps)

1) Push your code to GitHub

Make sure your changes are committed and pushed to the `main` branch:

```bash
git add .
git commit -m "Prepare render deployment: render.yaml + prod auth gate"
git push origin main
```

2) Create or connect a service on Render

- Go to https://dashboard.render.com
- Click "New" → "Web Service"
- Select "Create from render.yaml" (recommended) and point it to your repo. If you prefer the UI flow, choose "Connect a repository" and set:
  - Branch: main
  - Build command: npm install
  - Start command: npm start

3) Add environment variables (Dashboard → Your Service → Environment)

Add these (required):
- MONGO_URI = your production MongoDB connection string (keep it secret)
- JWT_SECRET = strong random string
- NODE_ENV = production

Note: for security set these as "Private" / "Secret" entries in Render.

4) Trigger a deploy

- The first deploy will start automatically when you create the service.
- To redeploy any time: open the Service → Manual Deploy → Deploy latest commit.

5) Verify

- Check the Deploy logs for build/runtime errors.
- Test endpoints (replace with your URL shown by Render):
  - GET /posts
  - POST /users/login to get a token
  - POST /posts with Authorization: Bearer <token>

6) Important: file uploads

Render's filesystem is ephemeral. Uploaded files saved to `public/uploads` may disappear on redeploy or across instances. For production use, integrate Cloudinary or S3 (I can add Cloudinary integration if you want).

If you want, I can:
- Add Cloudinary upload integration and update the upload handlers.
- Help you step through the Render dashboard and set the secrets.
- Trigger a manual deploy if you paste the Render service name and confirm repo settings.
