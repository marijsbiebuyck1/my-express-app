import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Animal from "../models/Animal.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-this";

const makeAbsoluteUrl = (req, value) => {
  if (!value || typeof value !== "string") return value;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  const normalized = value.startsWith("/") ? value : `/${value}`;
  return `${req.protocol}://${req.get("host")}${normalized}`;
};

const buildConversationKey = (conversation) => {
  const animalId = conversation?.animal?.toString?.()
    ? conversation.animal.toString()
    : conversation?.animal;
  if (conversation?.user) {
    return `${conversation.user.toString?.() ?? conversation.user}:${animalId}`;
  }
  if (conversation?.deviceKey) {
    return `device:${conversation.deviceKey}:${animalId}`;
  }
  if (conversation?.shelter) {
    return `shelter:${
      conversation.shelter.toString?.() ?? conversation.shelter
    }:${animalId}`;
  }
  return conversation?._id?.toString?.() ?? String(animalId);
};

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

  const shelterHeader =
    readHeader(req, "x-shelter-id") || readHeader(req, "x-admin-id");
  if (shelterHeader) {
    const clean = String(shelterHeader).trim();
    if (mongoose.Types.ObjectId.isValid(clean)) {
      return { shelterId: clean };
    }
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

  const hasUser = Boolean(identity.userId);
  const hasDevice = Boolean(identity.deviceKey);
  if (hasUser) {
    updates.user = identity.userId;
  }
  if (hasDevice) {
    updates.deviceKey = identity.deviceKey;
  }

  let filter;
  if (hasUser) {
    const clauses = [{ user: identity.userId }];
    if (hasDevice) {
      clauses.push({ deviceKey: identity.deviceKey });
    }
    if (clauses.length === 1) {
      filter = { ...clauses[0], animal: animalId };
    } else {
      filter = {
        animal: animalId,
        $or: clauses,
      };
    }
  } else {
    filter = { deviceKey: identity.deviceKey, animal: animalId };
  }

  const conversation = await Conversation.findOneAndUpdate(
    filter,
    { $set: updates, $setOnInsert: { matchedAt: new Date() } },
    { new: true, upsert: true }
  );

  return { conversation, animal };
}

async function findConversation(identity, animalId) {
  const base = { animal: animalId };
  let convo = null;

  if (identity.userId) {
    convo = await Conversation.findOne({ ...base, user: identity.userId });
    if (!convo && identity.deviceKey) {
      convo = await Conversation.findOne({
        ...base,
        deviceKey: identity.deviceKey,
      });
      if (convo && !convo.user) {
        convo.user = identity.userId;
        await convo.save();
      }
    }
  } else if (identity.deviceKey) {
    convo = await Conversation.findOne({
      ...base,
      deviceKey: identity.deviceKey,
    });
  }

  if (!convo) {
    const err = new Error("CONVERSATION_NOT_FOUND");
    err.statusCode = 404;
    throw err;
  }
  return convo;
}

async function findConversationById(conversationId, shelterId) {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const err = new Error("Invalid conversation id");
    err.statusCode = 400;
    throw err;
  }
  const convo = await Conversation.findOne({
    _id: conversationId,
    shelter: shelterId,
  });
  if (!convo) {
    const err = new Error("CONVERSATION_NOT_FOUND");
    err.statusCode = 404;
    throw err;
  }
  return convo;
}

async function createMessage({ conversation, sender, text, displayName }) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    const err = new Error("Text is required");
    err.statusCode = 400;
    throw err;
  }

  const fromKind = sender?.kind === "shelter" ? "shelter" : "user";
  const toKind = fromKind === "shelter" ? "user" : "shelter";

  if (sender?.kind === "user" && sender?.id && !conversation.user) {
    conversation.user = sender.id;
  }

  const message = await Message.create({
    conversation: conversation._id,
    conversationKey: buildConversationKey(conversation),
    user: conversation.user || undefined,
    deviceKey: conversation.deviceKey || undefined,
    animal: conversation.animal,
    shelter: conversation.shelter || undefined,
    fromKind,
    fromId: sender?.id,
    toKind,
    toId: toKind === "user" ? conversation.user : conversation.shelter,
    text: normalizedText,
    authorDisplayName: displayName,
  });

  conversation.lastMessage = normalizedText;
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
          sender: identity.shelterId
            ? { kind: "shelter", id: identity.shelterId }
            : { kind: "user", id: identity.userId },
          text: autoMessage,
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
    if (identity.shelterId) {
      const { animalId, userId } = req.query || {};
      const filter = { shelter: identity.shelterId };
      if (animalId) {
        if (!mongoose.Types.ObjectId.isValid(String(animalId))) {
          return res.status(400).json({ message: "Invalid animalId" });
        }
        filter.animal = String(animalId);
      }
      if (userId) {
        if (!mongoose.Types.ObjectId.isValid(String(userId))) {
          return res.status(400).json({ message: "Invalid userId" });
        }
        filter.user = String(userId);
      }

      const list = await Conversation.find(filter)
        .sort({ updatedAt: -1 })
        .populate("user", "name profileImage")
        .lean();

      const mapped = list.map((item) => {
        const userEntity =
          item.user && typeof item.user === "object" ? item.user : null;
        const participantName = userEntity?.name
          ? userEntity.name
          : item.deviceKey
          ? `Onbekende gebruiker (${String(item.deviceKey).slice(-4)})`
          : "Onbekende gebruiker";
        const participantAvatar = userEntity?.profileImage
          ? makeAbsoluteUrl(req, userEntity.profileImage)
          : null;
        return {
          id: item._id?.toString(),
          animalId: item.animal?.toString(),
          animalName: item.animalName || "Onbekend dier",
          userId:
            userEntity?._id?.toString?.() || item.user?.toString?.() || null,
          userName: participantName,
          userAvatar: participantAvatar,
          lastMessage: item.lastMessage || "",
          lastMessageAt: item.lastMessageAt,
          matchedAt: item.matchedAt,
          avatar: participantAvatar,
        };
      });
      return res.json(mapped);
    }

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

router.get("/:conversationOrAnimalId/messages", async (req, res) => {
  try {
    const identity = resolveIdentity(req);
    const { conversationOrAnimalId } = req.params;

    let conversation;
    if (identity.shelterId) {
      conversation = await findConversationById(
        conversationOrAnimalId,
        identity.shelterId
      );
    } else {
      if (!mongoose.Types.ObjectId.isValid(conversationOrAnimalId)) {
        return res.status(400).json({ message: "Invalid animalId" });
      }
      conversation = await findConversation(identity, conversationOrAnimalId);
    }

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

router.post("/:conversationOrAnimalId/messages", async (req, res) => {
  try {
    const identity = resolveIdentity(req);
    const { conversationOrAnimalId } = req.params;
    const { text } = req.body || {};
    if (!text || !String(text).trim().length) {
      return res.status(400).json({ message: "Text is required" });
    }

    let conversation;
    if (identity.shelterId) {
      conversation = await findConversationById(
        conversationOrAnimalId,
        identity.shelterId
      );
    } else {
      if (!mongoose.Types.ObjectId.isValid(conversationOrAnimalId)) {
        return res.status(400).json({ message: "Invalid animalId" });
      }
      ({ conversation } = await upsertConversation(
        identity,
        conversationOrAnimalId
      ));
    }

    const sender = identity.shelterId
      ? { kind: "shelter", id: identity.shelterId }
      : { kind: "user", id: identity.userId };
    const shelterNameHeader = identity.shelterId
      ? readHeader(req, "x-shelter-name")
      : null;

    const message = await createMessage({
      conversation,
      sender,
      text,
      displayName: identity.shelterId
        ? shelterNameHeader || "Asiel"
        : req.user?.name,
    });

    return res.status(201).json(message.toJSON());
  } catch (err) {
    const status = err?.statusCode || 500;
    return res.status(status).json({ message: err?.message || "Server error" });
  }
});

export default router;
