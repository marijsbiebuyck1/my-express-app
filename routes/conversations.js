import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Animal from "../models/Animal.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-this";

const buildConversationKey = (identity, animalId) =>
  identity.userId
    ? `${identity.userId}:${animalId}`
    : `device:${identity.deviceKey}:${animalId}`;

function readHeader(req, name) {
  return (
    req.get(name) ||
    req.get(name.toLowerCase()) ||
    req.get(name.toUpperCase()) ||
    req.headers[name.toLowerCase()]
  );
}

function resolveIdentity(req) {
  const authHeader = readHeader(req, "authorization");
  if (authHeader) {
    const parts = authHeader.split(" ");
    const token =
      parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : authHeader;
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload && payload.id) {
        return { userId: payload.id };
      }
    } catch (err) {
      // ignore invalid tokens and fall back to other strategies
    }
  }

  const fallbackUserId = readHeader(req, "x-user-id");
  if (
    fallbackUserId &&
    mongoose.Types.ObjectId.isValid(String(fallbackUserId).trim())
  ) {
    return { userId: String(fallbackUserId).trim() };
  }

  const deviceKey = readHeader(req, "x-device-key");
  if (deviceKey) {
    return { deviceKey: String(deviceKey) };
  }

  const err = new Error("Unauthorized");
  err.statusCode = 401;
  throw err;
}

async function fetchAnimal(animalId) {
  const animal = await Animal.findById(animalId).select("name photo shelter");
  if (!animal) {
    const err = new Error("ANIMAL_NOT_FOUND");
    err.statusCode = 404;
    throw err;
  }
  return animal;
}

async function upsertConversation(identity, animalId) {
  const animal = await fetchAnimal(animalId);
  const updates = {
    animalName: animal.name,
    animalPhoto: animal.photo || null,
    shelter: animal.shelter || null,
  };

  if (identity.userId) {
    updates.user = identity.userId;
  }
  if (identity.deviceKey) {
    updates.deviceKey = identity.deviceKey;
  }

  const filter = identity.userId
    ? { user: identity.userId, animal: animalId }
    : { deviceKey: identity.deviceKey, animal: animalId };

  const conversation = await Conversation.findOneAndUpdate(
    filter,
    { $set: updates, $setOnInsert: { matchedAt: new Date() } },
    { new: true, upsert: true }
  );

  return { conversation, animal };
}

async function findConversation(identity, animalId) {
  const filter = identity.userId
    ? { user: identity.userId, animal: animalId }
    : { deviceKey: identity.deviceKey, animal: animalId };
  const convo = await Conversation.findOne(filter);
  if (!convo) {
    const err = new Error("CONVERSATION_NOT_FOUND");
    err.statusCode = 404;
    throw err;
  }
  return convo;
}

async function createMessage({
  conversation,
  identity,
  animalId,
  text,
  senderKind = "user",
  displayName,
}) {
  const fromKind = senderKind === "user" ? "user" : senderKind;
  const toKind = fromKind === "user" ? "shelter" : "user";
  const message = await Message.create({
    conversation: conversation._id,
    conversationKey: buildConversationKey(identity, animalId),
    user: identity.userId,
    deviceKey: identity.deviceKey,
    animal: animalId,
    fromKind,
    fromId:
      fromKind === "user" && identity.userId ? identity.userId : undefined,
    toKind,
    toId:
      toKind === "user" && identity.userId
        ? identity.userId
        : conversation.shelter,
    text,
    authorDisplayName: displayName,
  });

  conversation.lastMessage = text;
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  return message;
}

router.post("/", async (req, res) => {
  try {
    const identity = resolveIdentity(req);
    const { animalId, autoMessage } = req.body || {};
    if (!animalId || !mongoose.Types.ObjectId.isValid(animalId)) {
      return res.status(400).json({ message: "Valid animalId is required" });
    }

    const { conversation } = await upsertConversation(identity, animalId);

    let messageDoc = null;
    if (typeof autoMessage === "string" && autoMessage.trim().length) {
      if (!conversation.autoMessageSent) {
        messageDoc = await createMessage({
          conversation,
          identity,
          animalId,
          text: autoMessage.trim(),
          senderKind: "user",
          displayName: req.user?.name,
        });
        conversation.autoMessageSent = true;
        await conversation.save();
      }
    }

    return res.status(messageDoc ? 201 : 200).json({
      conversation: conversation.toJSON(),
      message: messageDoc ? messageDoc.toJSON() : null,
    });
  } catch (err) {
    const status = err?.statusCode || 500;
    return res.status(status).json({ message: err?.message || "Server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const identity = resolveIdentity(req);
    const filter = identity.userId
      ? { user: identity.userId }
      : { deviceKey: identity.deviceKey };
    const list = await Conversation.find(filter).sort({ updatedAt: -1 }).lean();
    const mapped = list.map((item) => ({
      id: item._id?.toString(),
      animalId: item.animal?.toString(),
      name: item.animalName || "Onbekend dier",
      lastMessage: item.lastMessage || "",
      lastMessageAt: item.lastMessageAt,
      matchedAt: item.matchedAt,
      avatar: item.animalPhoto || null,
    }));
    return res.json(mapped);
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/:animalId/messages", async (req, res) => {
  try {
    const identity = resolveIdentity(req);
    const { animalId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(animalId)) {
      return res.status(400).json({ message: "Invalid animalId" });
    }

    const conversation = await findConversation(identity, animalId);
    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: 1 })
      .lean();
    const data = messages.map((msg) => ({
      id: msg._id?.toString(),
      text: msg.text,
      createdAt: msg.createdAt,
      fromKind: msg.fromKind,
      authorDisplayName: msg.authorDisplayName,
    }));
    return res.json({
      conversation: conversation.toJSON(),
      messages: data,
    });
  } catch (err) {
    const status = err?.statusCode || 500;
    return res.status(status).json({ message: err?.message || "Server error" });
  }
});

router.post("/:animalId/messages", async (req, res) => {
  try {
    const identity = resolveIdentity(req);
    const { animalId } = req.params;
    const { text } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(animalId)) {
      return res.status(400).json({ message: "Invalid animalId" });
    }
    if (!text || !String(text).trim().length) {
      return res.status(400).json({ message: "Text is required" });
    }

    const { conversation } = await upsertConversation(identity, animalId);
    const message = await createMessage({
      conversation,
      identity,
      animalId,
      text: String(text).trim(),
      senderKind: "user",
      displayName: req.user?.name,
    });

    return res.status(201).json(message.toJSON());
  } catch (err) {
    const status = err?.statusCode || 500;
    return res.status(status).json({ message: err?.message || "Server error" });
  }
});

export default router;
