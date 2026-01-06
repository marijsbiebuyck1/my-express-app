import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Animal from "../models/Animal.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Shelter from "../models/Shelter.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-this";

const AUTO_MESSAGE_SUFFIX =
  "Twijfels of vragen? Je kunt ze altijd hier stellen. Geen vragen meer? Vul dan het formulier in en wie weet claim ik binnenkort mijn plekje op jouw bank 😸.";
const AUTO_MESSAGE_INTROS = [
  "Ik heb 9 levens… wil jij er eentje met mij delen?",
  "Oké, eerlijk? Ik kwam voor de snacks… maar ik blijf misschien voor jou.",
  "Ik ben misschien een beetje verlegen, maar voor jou wil ik wel spinnen...",
  "Ik ben meer een ‘kijk-eerst-de-kat-uit-de-boom’-type… maar jij lijkt veilig.",
  "Dus eh… wat is jouw favoriete snack? Vraag voor een kat.",
  "Zullen we doen alsof dit heel casual is, terwijl ik al een plekje op je bank claim?",
];

const makeAbsoluteUrl = (req, value) => {
  if (!value || typeof value !== "string") return value;

  // ✅ base64/data URL should be returned as-is
  if (value.startsWith("data:")) return value;

  // ✅ already absolute
  if (value.startsWith("http://") || value.startsWith("https://")) return value;

  // ✅ treat as relative file path
  const normalized = value.startsWith("/") ? value : `/${value}`;

  // ✅ respect proxy (optional but recommended)
  const proto = req.get("x-forwarded-proto")
    ? String(req.get("x-forwarded-proto")).split(",")[0].trim()
    : req.protocol;

  return `${proto}://${req.get("host")}${normalized}`;
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

const ADMIN_CLIENT_HEADER = "x-admin-client";
const ADMIN_CLIENT_VALUE = "1";

function isAdminClient(req) {
  const flag = readHeader(req, ADMIN_CLIENT_HEADER);
  if (!flag) return false;
  return String(flag).trim() === ADMIN_CLIENT_VALUE;
}

async function attachShelterFromAnimal(identity, animalId) {
  if (identity?.shelterId) return identity;
  if (!animalId || !mongoose.Types.ObjectId.isValid(String(animalId))) {
    return identity;
  }
  const animal = await Animal.findById(animalId).select("shelter");
  if (animal?.shelter) {
    identity.shelterId = animal.shelter.toString();
  }
  return identity;
}

function readHeader(req, name) {
  return (
    req.get(name) ||
    req.get(name.toLowerCase()) ||
    req.get(name.toUpperCase()) ||
    req.headers[name.toLowerCase()]
  );
}

function resolveIdentity(req) {
  const shelterHeader =
    readHeader(req, "x-shelter-id") || readHeader(req, "x-admin-id");
  if (shelterHeader) {
    const clean = String(shelterHeader).trim();
    if (mongoose.Types.ObjectId.isValid(clean)) {
      return { shelterId: clean };
    }
  }

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
      clauses.push(
        { deviceKey: identity.deviceKey, user: null },
        { deviceKey: identity.deviceKey, user: { $exists: false } }
      );
    }
    filter =
      clauses.length === 1
        ? { ...clauses[0], animal: animalId }
        : {
            animal: animalId,
            $or: clauses,
          };
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
      let deviceConvo = await Conversation.findOne({
        ...base,
        deviceKey: identity.deviceKey,
      });
      if (deviceConvo) {
        const convoUserId = deviceConvo.user?.toString?.();
        const canClaim = !convoUserId || convoUserId === identity.userId;
        if (!canClaim) {
          deviceConvo = null;
        } else if (!convoUserId) {
          deviceConvo.user = identity.userId;
          await deviceConvo.save();
        }
      }
      convo = deviceConvo;
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
  let convo = await Conversation.findOne({
    _id: conversationId,
    shelter: shelterId,
  });
  if (convo && convo.populate) {
    try {
      await convo.populate("user", "name profileImage");
    } catch (e) {
      /* ignore populate errors */
    }
  }
  if (convo) return convo;

  convo = await Conversation.findById(conversationId);
  if (convo && convo.populate) {
    try {
      await convo.populate("user", "name profileImage");
    } catch (e) {
      /* ignore populate errors */
    }
  }
  if (!convo) {
    const err = new Error("CONVERSATION_NOT_FOUND");
    err.statusCode = 404;
    throw err;
  }

  if (!shelterId) {
    const err = new Error("CONVERSATION_NOT_FOUND");
    err.statusCode = 404;
    throw err;
  }

  const belongs = await Animal.exists({
    _id: convo.animal,
    shelter: shelterId,
  });
  if (!belongs) {
    const err = new Error("CONVERSATION_NOT_FOUND");
    err.statusCode = 404;
    throw err;
  }

  if (!convo.shelter) {
    convo.shelter = shelterId;
    await convo.save();
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

function buildAutoMessage() {
  const intros = AUTO_MESSAGE_INTROS.filter(
    (entry) => typeof entry === "string" && entry.trim().length
  );
  const fallbackSuffix = AUTO_MESSAGE_SUFFIX?.trim() || "";
  const pick = intros.length
    ? intros[Math.floor(Math.random() * intros.length)]
    : "";
  const intro = typeof pick === "string" ? pick.trim() : "";
  if (!intro && !fallbackSuffix) {
    return "";
  }
  if (!fallbackSuffix) return intro;
  if (!intro) return fallbackSuffix;
  return `${intro}\n\n${fallbackSuffix}`;
}

async function ensureAutomaticShelterMessage({
  conversation,
  identity,
  overrideText,
}) {
  if (!conversation || conversation.autoMessageSent) return null;
  let text = typeof overrideText === "string" ? overrideText.trim() : "";
  if (!text) text = buildAutoMessage();
  if (!text) return null;

  const shelterId = await resolveShelterIdForConversation(
    conversation,
    identity
  );
  if (!shelterId) return null;

  let displayName = null;
  try {
    const shelter = await Shelter.findById(shelterId).select("name").lean();
    displayName = shelter?.name || null;
  } catch (err) {
    console.warn("Failed to resolve shelter name for auto message", err);
  }

  const messageDoc = await createMessage({
    conversation,
    sender: { kind: "shelter", id: shelterId },
    text,
    displayName: displayName || undefined,
  });
  conversation.autoMessageSent = true;
  await conversation.save();
  return messageDoc;
}

async function resolveShelterIdForConversation(conversation, identity) {
  if (!conversation) return null;
  if (conversation.shelter) {
    const existing =
      typeof conversation.shelter === "string"
        ? conversation.shelter
        : conversation.shelter.toString?.();
    if (existing) return existing;
  }
  if (identity?.shelterId) return identity.shelterId;

  const animalId = conversation.animal?.toString?.()
    ? conversation.animal.toString()
    : conversation.animal;
  if (!animalId) return null;

  const animal = await Animal.findById(animalId).select("shelter").lean();
  if (animal?.shelter) {
    const resolved =
      typeof animal.shelter === "string"
        ? animal.shelter
        : animal.shelter.toString?.();
    if (resolved) {
      conversation.shelter = animal.shelter;
      return resolved;
    }
  }
  return null;
}

router.post("/", async (req, res) => {
  try {
    const identity = resolveIdentity(req);
    const { animalId, autoMessage } = req.body || {};
    if (!animalId || !mongoose.Types.ObjectId.isValid(animalId)) {
      return res.status(400).json({ message: "Valid animalId is required" });
    }

    const { conversation } = await upsertConversation(identity, animalId);
    const overrideText =
      typeof autoMessage === "string" && autoMessage.trim().length
        ? autoMessage
        : null;
    const messageDoc = await ensureAutomaticShelterMessage({
      conversation,
      identity,
      overrideText,
    });

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
    const adminClient = isAdminClient(req);
    const { animalId, userId } = req.query || {};
    let requestedAnimalId = null;
    if (animalId) {
      if (!mongoose.Types.ObjectId.isValid(String(animalId))) {
        return res.status(400).json({ message: "Invalid animalId" });
      }
      requestedAnimalId = String(animalId);
    }

    if (!identity.shelterId && adminClient && requestedAnimalId) {
      await attachShelterFromAnimal(identity, requestedAnimalId);
    }

    if (identity.shelterId) {
      if (userId && !mongoose.Types.ObjectId.isValid(String(userId))) {
        return res.status(400).json({ message: "Invalid userId" });
      }

      const animalMeta = new Map();
      const ownedAnimalIds = [];
      if (requestedAnimalId) {
        const owned = await Animal.findOne({
          _id: requestedAnimalId,
          shelter: identity.shelterId,
        })
          .select("_id name photo")
          .lean();
        if (owned) {
          const key = owned._id.toString();
          animalMeta.set(key, owned);
          ownedAnimalIds.push(key);
        }
      } else {
        const animals = await Animal.find({ shelter: identity.shelterId })
          .select("_id name photo")
          .lean();
        animals.forEach((a) => {
          const key = a._id.toString();
          ownedAnimalIds.push(key);
          animalMeta.set(key, a);
        });
      }

      const filter = {
        $or: [
          { shelter: identity.shelterId },
          ...(ownedAnimalIds.length
            ? [{ animal: { $in: ownedAnimalIds } }]
            : []),
        ],
      };
      if (requestedAnimalId) filter.animal = requestedAnimalId;
      if (userId) filter.user = String(userId);

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
        const animalKey = item.animal?.toString?.();
        const animalInfo = animalKey ? animalMeta.get(animalKey) : null;
        return {
          id: item._id?.toString(),
          animalId: item.animal?.toString(),
          animalName: item.animalName || animalInfo?.name || "Onbekend dier",
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

router.delete("/:conversationOrAnimalId", async (req, res) => {
  try {
    const identity = resolveIdentity(req);
    const { conversationOrAnimalId } = req.params;

    let conversation = null;
    if (identity.shelterId) {
      conversation = await findConversationById(
        conversationOrAnimalId,
        identity.shelterId
      );
    } else {
      if (!identity.deviceKey && !identity.userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (mongoose.Types.ObjectId.isValid(conversationOrAnimalId)) {
        const direct = await Conversation.findById(conversationOrAnimalId);
        if (direct) {
          const ownsConversation =
            (identity.userId &&
              direct.user?.toString?.() === identity.userId) ||
            (identity.deviceKey && direct.deviceKey === identity.deviceKey);
          if (ownsConversation) {
            conversation = direct;
          }
        }
      }

      if (!conversation) {
        if (!mongoose.Types.ObjectId.isValid(conversationOrAnimalId)) {
          return res
            .status(400)
            .json({ message: "Invalid conversation or animal id" });
        }
        conversation = await findConversation(identity, conversationOrAnimalId);
      }
    }

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    await Message.deleteMany({ conversation: conversation._id });
    await Conversation.deleteOne({ _id: conversation._id });

    return res.json({ success: true });
  } catch (err) {
    const status = err?.statusCode || 500;
    return res.status(status).json({ message: err?.message || "Server error" });
  }
});

router.get("/:conversationOrAnimalId/messages", async (req, res) => {
  try {
    const identity = resolveIdentity(req);
    const adminClient = isAdminClient(req);
    const queryAnimalId = req.query?.animalId
      ? String(req.query.animalId)
      : null;
    if (!identity.shelterId && adminClient && queryAnimalId) {
      await attachShelterFromAnimal(identity, queryAnimalId);
    }
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

    // populate message user so we can access user.profileImage
    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: 1 })
      .populate("user", "name profileImage")
      .lean();

    const data = messages.map((msg) => {
      // decide author profile image: prefer stored authorProfileImage, then user.profileImage, then animal photo
      const rawAuthorImage =
        msg.authorProfileImage ||
        (msg.fromKind === "user" ? msg.user?.profileImage : null) ||
        (msg.fromKind === "animal" ? conversation.animalPhoto : null) ||
        null;
      const authorProfileImage = makeAbsoluteUrl(req, rawAuthorImage);

      return {
        id: msg._id?.toString(),
        text: msg.text,
        createdAt: msg.createdAt,
        fromKind: msg.fromKind,
        authorDisplayName: msg.authorDisplayName,
        authorProfileImage,
      };
    });

    // ensure conversation user/profile images are absolute for admin UI
    const convoObj = conversation.toJSON ? conversation.toJSON() : conversation;
    if (convoObj.user && convoObj.user.profileImage) {
      convoObj.user.profileImage = makeAbsoluteUrl(req, convoObj.user.profileImage);
      if (convoObj.user._id) {
        convoObj.user.id = convoObj.user._id.toString();
        delete convoObj.user._id;
      }
    }
    if (convoObj.animalPhoto) {
      convoObj.animalPhoto = makeAbsoluteUrl(req, convoObj.animalPhoto);
    }

    return res.json({
      conversation: convoObj,
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
    const adminClient = isAdminClient(req);
    const queryAnimalId = req.query?.animalId
      ? String(req.query.animalId)
      : null;
    if (!identity.shelterId && adminClient && queryAnimalId) {
      await attachShelterFromAnimal(identity, queryAnimalId);
    }
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
