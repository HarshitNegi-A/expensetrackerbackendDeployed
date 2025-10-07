const User = require("../model/UserModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sequelize = require("../db");
const { v4: uuidv4 } = require('uuid');
const ForgetPassword=require('../model/ForgetPasswordModel')
const nodemailer = require('nodemailer');
require('dotenv').config()

exports.signup = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      await t.rollback();
      return res.status(400).json({ message: "user already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create(
      {
        name,
        email,
        password: hashedPassword,
      },
      { transaction: t }
    );
    const token = jwt.sign({ id: newUser.id }, process.env.JWT_KEY);
    await t.commit();
    res.status(201).json({
      message: "User created successfully",
      token,
      newUser,
    });
  } catch (err) {
    await t.rollback();
    console.error("Error Name:", err.name);
    console.error("Error Message:", err.message);
    res.status(500).json({ message: "Something went wrong" });
  }
};
exports.login = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email }, transaction: t });
    if (!user) {
      await t.rollback();
      res.status(400).json({ message: "Invalid email or password" });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await t.rollback();
      return res.status(400).json({ message: "Invalid email or password" });
    }
    const token = jwt.sign({ id: user.id }, process.env.JWT_KEY);
    await t.commit();
    res.status(200).json({
      message: "Login successful",
      token,
      newUser: user,
    });
  } catch (err) {
    await t.rollback();
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  }
};

exports.forgetPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create UUID and store in DB
    const id = uuidv4();
    await ForgetPassword.create({
      id: id,
      isActive: true,
      userId: user.id,
    });

    const resetLink = `https://expensetracker1101.netlify.app/resetpassword/${id}`;

    // Create transporter using Brevo
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // Email message
    const mailOptions = {
      from: process.env.SENDER_MAIL,
      to: normalizedEmail,
      subject: "Reset Your Password",
      html: `
        <h3>Password Reset Request</h3>
        <p>Click the link below to reset your password. This link is valid for one-time use.</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>If you didn’t request this, you can safely ignore this email.</p>
      `,
    };

    //  Send email
    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "Reset password email sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: err.message });
  }
};

exports.resetPassword=async(req,res)=>{
  const id = req.params.id;
  try {
    const request = await ForgetPassword.findOne({ where: { id } });

    if (!request || !request.isActive) {

      return res.status(400).json({ message: 'Link expired or invalid' });
    }
    return res.status(200).json({ message: 'Valid link', id });
  } catch (err) {
    console.error('Reset form error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

exports.updatePassword = async (req, res) => {
  const t=await sequelize.transaction()
  const id = req.params.id;
  const { newPassword } = req.body;

  try {
    const request = await ForgetPassword.findOne({ where: { id },transaction:t });

    if (!request || !request.isActive) {
      await t.rollback()
      return res.status(400).json({ message: 'Invalid or expired request' });
    }

    const user = await User.findByPk(request.userId,{transaction:t});

    if (!user) {
      await t.rollback()
      return res.status(404).json({ message: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save({transaction:t});

    // Mark the request as used
    request.isActive = false;
    await request.save({transaction:t});
    await t.commit()
    res.status(200).json({ message: 'Password updated successfully' });

  } catch (err) {
    await t.rollback()
    console.error('Update password error:', err);
    res.status(500).json({ message: 'Server error' })
  }
};
