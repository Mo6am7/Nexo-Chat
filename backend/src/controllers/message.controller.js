
import { getReceiverSocketId, io } from "../lib/socket.js";
import { prisma } from "../lib/db.js";

export const getAllContacts = async (req, res) => {
  try {
    const loggedInUserId = req.user.id;
    const filteredUsers = await prisma.user.findMany({
      where: { id: { not: loggedInUserId } },
      select: { id: true, email: true, fullName: true, profilePic: true }
    });

    res.status(200).json(filteredUsers);
  } catch (error) {
    console.log("Error in getAllContacts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMessagesByUserId = async (req, res) => {
  try {
    const myId = req.user.id;
    const { id: userToChatId } = req.params;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: myId, receiverId: userToChatId },
          { senderId: userToChatId, receiverId: myId },
        ]
      },
      orderBy: { createdAt: 'asc' }
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user.id;

    if (!text && !image) {
      return res.status(400).json({ message: "Text or image is required." });
    }
    if (senderId === receiverId) {
      return res.status(400).json({ message: "Cannot send messages to yourself." });
    }
    const receiverExists = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiverExists) {
      return res.status(404).json({ message: "Receiver not found." });
    }

    let imageUrl = image; // the image is already a base64 string

    const newMessage = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        text,
        image: imageUrl,
      }
    });

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getChatPartners = async (req, res) => {
  try {
    const loggedInUserId = req.user.id;

    // find all the messages where the logged-in user is either sender or receiver
    const messages = await prisma.message.findMany({
      where: {
        OR: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }]
      }
    });

    const chatPartnerIds = [
      ...new Set(
        messages.map((msg) =>
          msg.senderId === loggedInUserId
            ? msg.receiverId
            : msg.senderId
        )
      ),
    ];

    const chatPartners = await prisma.user.findMany({
      where: { id: { in: chatPartnerIds } },
      select: { id: true, email: true, fullName: true, profilePic: true }
    });

    res.status(200).json(chatPartners);
  } catch (error) {
    console.error("Error in getChatPartners: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
