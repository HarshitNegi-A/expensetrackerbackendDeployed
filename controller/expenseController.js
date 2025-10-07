// controller/expenseController.js
const Expense = require("../model/ExpenseModel");
const sequelize = require("../db");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// ✅ Add Expense
exports.addExpense = async (req, res) => {
  let t;
  const { amount, description, category } = req.body;
  try {
    t = await sequelize.transaction();
    const expense = await Expense.create(
      {
        amount,
        description,
        category,
        userId: req.user.id,
        note: "Migrations are working",
      },
      { transaction: t }
    );

    if (!expense) {
      return res.status(400).json({ message: "unable to add expense" });
    }

    await t.commit();
    res.status(201).json({ message: "Expense added successfully", expense });
  } catch (err) {
    if (t) await t.rollback();
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  }
};

// ✅ Get all Expenses
exports.getExpense = async (req, res) => {
  try {
    const expenses = await Expense.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
    });
    res.status(200).json({ message: "Expense fetched", expenses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Download Expenses (no S3, uses multer & fs)
exports.downloadExpenses = async (req, res) => {
  try {
    const expenses = await Expense.findAll({ where: { userId: req.user.id } });

    if (!expenses || expenses.length === 0) {
      return res.status(404).json({ message: "No expenses found!" });
    }

    // Convert to TXT format
    let txtData = "Expense Report\n\n";
    expenses.forEach((exp, i) => {
      txtData += `#${i + 1}\n`;
      txtData += `Amount: ₹${exp.amount}\n`;
      txtData += `Category: ${exp.category}\n`;
      txtData += `Description: ${exp.description}\n`;
      txtData += `Date: ${exp.createdAt.toISOString().split("T")[0]}\n`;
      txtData += "-----------------------------\n";
    });

    // Create local folder (if not exists)
    const downloadDir = path.join(__dirname, "../downloads");
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

    // Create unique filename
    const fileName = `expenses_${req.user.id}_${Date.now()}.txt`;
    const filePath = path.join(downloadDir, fileName);

    // Write file locally
    fs.writeFileSync(filePath, txtData);

    // Send file for download
    res.download(filePath, (err) => {
      if (err) {
        console.error("Download error:", err);
        res.status(500).json({ message: "Failed to download file" });
      }

      // Delete file after sending
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) console.error("Error deleting file:", unlinkErr);
      });
    });
  } catch (err) {
    console.error("Download expenses error:", err);
    res.status(500).json({ message: "Failed to generate expense report" });
  }
};

// ✅ Edit Expense
exports.editExpense = async (req, res) => {
  const { id } = req.params;
  const { amount, description, category } = req.body;

  try {
    const expense = await Expense.findOne({
      where: { id, userId: req.user.id },
    });

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    await expense.update({ amount, description, category });

    res.status(200).json({ message: "Expense updated successfully", expense });
  } catch (err) {
    console.error("Edit expense error:", err);
    res.status(500).json({ message: "Failed to edit expense" });
  }
};

// ✅ Delete Expense
exports.deleteExpense = async (req, res) => {
  const { id } = req.params;

  try {
    const expense = await Expense.findOne({
      where: { id, userId: req.user.id },
    });

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    await expense.destroy();

    res.status(200).json({ message: "Expense deleted successfully" });
  } catch (err) {
    console.error("Delete expense error:", err);
    res.status(500).json({ message: "Failed to delete expense" });
  }
};
