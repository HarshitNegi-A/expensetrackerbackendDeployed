const { Sequelize } = require("sequelize");
const sequelize = require("../db");
const Order = require("../model/OrderModel");
const User = require("../model/UserModel");
const Expense = require("../model/ExpenseModel");
const { Cashfree, CFEnvironment } = require("cashfree-pg");
require("dotenv").config();

const cashfree = new Cashfree(
  CFEnvironment.SANDBOX, 
  process.env.CASHFREE_APP_ID,
  process.env.CASHFREE_SECRET_KEY
);


exports.premium = async (req, res) => {
  let t;
  try {
    const user = req.user; // from JWT middleware
    if (!user) return res.status(401).json({ message: "User not found" });

    const orderId = `order_${Date.now()}_${user.id}`;

    const request = {
      order_id: orderId,
      order_amount: 499, // ₹499
      order_currency: "INR",
      customer_details: {
        customer_id: `user_${user.id}`,
        customer_email: user.email || "test@example.com",
        customer_phone: user.phone || "9999999999",
      },
      order_meta: {
        return_url:
          "http://localhost:5173/payment-status?order_id={order_id}",
      },
    };

    const response = await cashfree.PGCreateOrder(request);

    if (!response.data || !response.data.payment_session_id) {
      console.error("Cashfree response missing payment_session_id:", response.data);
      return res.status(500).json({ message: "Cashfree did not return a session ID" });
    }

    t = await sequelize.transaction();
    await Order.create(
      {
        orderId,
        userId: user.id,
        paymentStatus: "PENDING",
      },
      { transaction: t }
    );
    await t.commit();
    return res.status(200).json({
      payment_session_id: response.data.payment_session_id,
      orderId,
    });
  } catch (err) {
    if (t) await t.rollback();
    console.error("Cashfree error (premium):", err?.response?.data || err.message);
    return res.status(500).json({ message: "Payment initiation failed" });
  }
};


exports.verifyPayment = async (req, res) => {
  let t;
  try {
    const { order_id } = req.query;

    if (!order_id) {
      return res.status(400).json({ message: "order_id is required" });
    }

    // Fetch payment details from Cashfree using order_id
    console.log("verifyPayment: fetching payments for order id =", order_id);
    const cashfreeResult = await cashfree.PGOrderFetchPayments(order_id);

    let paid = false;
    if (cashfreeResult && Array.isArray(cashfreeResult.data) && cashfreeResult.data.length > 0) {
      const payment = cashfreeResult.data[0]; // latest payment
      console.log("verifyPayment: payment object:", payment);

      if (payment.payment_status === "SUCCESS" || payment.payment_status === "PAID") {
        paid = true;
      }
    }

    if (paid) {
      // Update DB and user inside a transaction
      t = await sequelize.transaction();

      const order = await Order.findOne({ where: { orderId: order_id }, transaction: t });
      if (!order) {
        await t.commit();
        return res.status(404).json({ message: "Order not found in DB", orderId: order_id });
      }

      await order.update({ paymentStatus: "SUCCESS" }, { transaction: t });

      const user = await User.findByPk(order.userId, { transaction: t });
      if (user) {
        await user.update({ isPremium: true }, { transaction: t });
      }

      await t.commit();

      return res.status(200).json({
        status: "PAID",
        user: user ? { id: user.id, name: user.name, email: user.email, isPremium: user.isPremium } : null,
        message: "Payment verified and user upgraded to premium",
      });
    }

    // If not paid -> mark order as FAILED
    await Order.update({ paymentStatus: "FAILED" }, { where: { orderId: order_id } });
    return res.status(200).json({ status: "NOT_PAID" });
  } catch (err) {
    if (t) await t.rollback();
    console.error("Payment verification error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Failed to verify payment" });
  }
};

exports.leaderboard = async (req, res) => {
  let t;
  try {
    t = await sequelize.transaction();
    const leaderboard = await Expense.findAll({
      transaction: t,
      attributes: [
        "userId",
        [Sequelize.fn("SUM", Sequelize.col("amount")), "totalExpenses"],
      ],
      include: [
        {
          model: User,
          attributes: ["id", "name", "email"],
        },
      ],
      group: ["userId", "User.id"],
      order: [[Sequelize.fn("SUM", Sequelize.col("amount")), "DESC"]],
    });
    await t.commit();
    return res.status(200).json(leaderboard);
  } catch (err) {
    if (t) await t.rollback();
    console.error("Leaderboard error:", err);
    return res.status(500).json({ message: "Unable to fetch leaderboard" });
  }
};
