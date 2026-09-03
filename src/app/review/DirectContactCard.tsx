const PHONE_DISPLAY = "+84 901 019 555";
const PHONE_E164 = "+84901019555";
const EMAIL = "hongtuant9@gmail.com";
const WHATSAPP_MESSAGE =
  "Hi, I recently visited Cozy Garden and would like to share some feedback about my experience.";

export default function DirectContactCard() {
  const whatsappUrl = `https://wa.me/${PHONE_E164.replace("+", "")}?text=${encodeURIComponent(
    WHATSAPP_MESSAGE
  )}`;

  return (
    <div
      style={{
        marginTop: 18,
        padding: 18,
        borderRadius: 16,
        background: "#fff",
        border: "1px solid #efd8aa",
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 850,
          color: "#5b451c",
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        Contact the owner directly
      </div>

      <div
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: "#63573e",
          textAlign: "center",
          marginBottom: 10,
        }}
      >
        I’m the owner of Cozy Garden, and I would genuinely appreciate hearing more
        about your experience. If it’s easier, please send me a WhatsApp message
        directly. I will personally read your message.
      </div>

      <div
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: "#63573e",
          textAlign: "center",
          fontStyle: "italic",
          marginBottom: 14,
        }}
      >
        Tôi là chủ Cozy Garden và thực sự rất mong được nghe thêm về trải nghiệm của
        bạn. Nếu thuận tiện, bạn hãy nhắn trực tiếp cho tôi qua WhatsApp. Tôi sẽ trực
        tiếp đọc phản hồi của bạn.
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          style={contactButtonStyle("#1f7a4f", "#fff", 15)}
        >
          Message the owner on WhatsApp
        </a>

        <a
          href={`mailto:${EMAIL}?subject=Cozy%20Garden%20%E2%80%94%20Guest%20Feedback`}
          style={contactButtonStyle("#edf0ea", "#203020", 14)}
        >
          Email the owner
        </a>
      </div>

      <div
        style={{
          marginTop: 13,
          fontSize: 12,
          lineHeight: 1.55,
          color: "#7a6a49",
          textAlign: "center",
        }}
      >
        Email: {EMAIL}
        <br />
        Phone: {PHONE_DISPLAY}
        <br />
        Messaging is preferred so I don’t miss your feedback.
        <br />
        <span style={{ fontStyle: "italic" }}>
          Ưu tiên nhắn tin để tôi không bỏ lỡ phản hồi của bạn.
        </span>
      </div>
    </div>
  );
}

function contactButtonStyle(background: string, color: string, fontSize: number) {
  return {
    display: "block",
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "14px 14px",
    borderRadius: 13,
    background,
    color,
    textAlign: "center" as const,
    textDecoration: "none",
    fontSize,
    fontWeight: 800,
  };
}
