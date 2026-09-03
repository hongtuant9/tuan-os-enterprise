const PHONE_DISPLAY = "+84 901 019 555";
const PHONE_E164 = "+84901019555";
const EMAIL = "hongtuant9@gmail.com";

export default function DirectContactCard() {
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
          fontSize: 15,
          fontWeight: 850,
          color: "#5b451c",
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        Prefer to contact us directly?
      </div>

      <div
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: "#63573e",
          textAlign: "center",
          marginBottom: 14,
        }}
      >
        If you prefer not to leave your contact details in the form, you are very
        welcome to contact me directly. I would sincerely appreciate hearing about
        your experience so Cozy Garden can learn, improve, and serve our guests better.
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
        Nếu bạn không tiện để lại thông tin liên hệ trong biểu mẫu, bạn hoàn toàn có
        thể liên hệ trực tiếp với tôi. Tôi thực sự rất mong được nghe về trải nghiệm
        của bạn để Cozy Garden có thể rút kinh nghiệm, cải thiện và phục vụ khách hàng
        tốt hơn.
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <a
          href={`https://wa.me/${PHONE_E164.replace("+", "")}`}
          target="_blank"
          rel="noreferrer"
          style={contactButtonStyle("#1f7a4f", "#fff")}
        >
          WhatsApp me directly
        </a>

        <a
          href={`tel:${PHONE_E164}`}
          style={contactButtonStyle("#edf0ea", "#203020")}
        >
          Call {PHONE_DISPLAY}
        </a>

        <a
          href={`mailto:${EMAIL}?subject=Cozy%20Garden%20feedback`}
          style={contactButtonStyle("#edf0ea", "#203020")}
        >
          Email {EMAIL}
        </a>
      </div>
    </div>
  );
}

function contactButtonStyle(background: string, color: string) {
  return {
    display: "block",
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "13px 14px",
    borderRadius: 13,
    background,
    color,
    textAlign: "center" as const,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 800,
  };
}
