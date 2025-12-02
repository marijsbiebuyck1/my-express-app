import React, { useState, useRef } from 'react';

/**
 * UploadAndPost
 * - Demonstrates selecting an image file, resizing/manipulating it on a canvas,
 *   creating a data URL (base64), calling setImage with the requested string
 *   setImage(`data:image/jpeg;base64,${manipulatedImage.base64}`)
 * - Shows a preview and POSTs JSON to the server endpoints that accept data-URLs
 *
 * Props:
 * - type: 'profile'|'post'|'animal'|'shelter' (decides endpoint)
 * - id: userId / shelterId when needed
 * - token: optional JWT for Authorization header
 */
export default function UploadAndPost({ type = 'profile', id = '', token = '' }) {
  const [image, setImage] = useState(null); // data URL
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);

  const getEndpoint = () => {
    if (type === 'profile') return `/users/${id}/avatar`;
    if (type === 'post') return '/posts';
    if (type === 'animal') return '/animals';
    if (type === 'shelter') return `/asielen/${id}/avatar`;
    return '/posts';
  };

  // Read file, optionally resize, return dataURL (jpeg)
  const fileToDataUrl = (file, maxWidth = 1200) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const ratio = Math.min(1, maxWidth / img.width);
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          // quality 0.8 for jpeg
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

  const onFileChange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const dataUrl = await fileToDataUrl(f);
      // extract base64 portion
      const base64 = dataUrl.split(',')[1];
      // This is the exact string you asked for:
      const requested = `data:image/jpeg;base64,${base64}`;
      // set local preview
      setImage(requested);
      // optional: setImage call (if you use this function externally)
      // setImage(requested);
    } catch (err) {
      console.error('Error converting file:', err);
      setStatus('Error converting file');
    }
  };

  const onSubmit = async (evt) => {
    evt && evt.preventDefault();
    if (!image) return setStatus('No image selected');
    setStatus('Uploading...');
    const endpoint = getEndpoint();

    // Compose body depending on endpoint
    let body = {};
    if (type === 'profile' || type === 'shelter') {
      body = { profileImage: image };
    } else if (type === 'post') {
      body = { image, caption: 'Uploaded from frontend' };
    } else if (type === 'animal') {
      // example minimal animal payload — requires shelterId or shelterId alias on server
      body = { image, name: 'New animal', birthdate: new Date().toISOString(), shelterId: id };
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || JSON.stringify(json));
      setStatus('Upload successful');
      console.log('server response', json);
    } catch (err) {
      console.error('Upload failed', err);
      setStatus(`Upload failed: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h3>Upload image ({type})</h3>
      <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} />
      {image && (
        <div style={{ marginTop: 12 }}>
          <div>Preview:</div>
          <img src={image} alt="preview" style={{ maxWidth: '100%', height: 'auto' }} />
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <button onClick={onSubmit}>Upload</button>
      </div>
      {status && <div style={{ marginTop: 8 }}>{status}</div>}
      <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
        Note: this component creates the data URL and uses the app's JSON endpoints that accept
        base64 data URLs (profile/post/animal/shelter avatar).
      </div>
    </div>
  );
}
