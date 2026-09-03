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
          lineHeight: 1.6,
          color: "#63573e",
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        If you prefer not to leave your contact details in the form, you are very
        welcome to message, call, or email me directly. I am the owner of Cozy Garden,
        and I would sincerely appreciate hearing more about your experience so I can
        understand what went wrong, learn from it, and help our team improve our service.
      </div>

      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: "#63573e",
          textAlign: "center",
          fontStyle: "italic",
          marginBottom: 14,
        }}
      >
        Nếu bạn không tiện để lại thông tin liên hệ trong biểu mẫu, bạn hoàn toàn có thể
        nhắn tin, gọi điện hoặc gửi email trực tiếp cho tôi. Tôi là chủ Cozy Garden và
        thực sự rất mong được nghe thêm về trải nghiệm của bạn để hiểu rõ điều gì chưa tốt,
        rút kinh nghiệm và cùng đội ngũ cải thiện chất lượng phục vụ.
      </div>

      <div
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          color: "#7a6a49",
          textAlign: "center",
          marginBottom: 14,
        }}
      >
        Your message will come directly to me. / Tin nhắn của bạn sẽ được gửi trực tiếp tới tôi.
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <a
          href={`https://wa.me/${PHONE_E164.replace("+", "")}`}
          target="_blank"
          rel="noreferrer"
          style={contactButtonStyle("#1f7a4f", "#fff")}
        >
          WhatsApp the owner directly
        </a>

        <a
          href={`tel:${PHONE_E164}`}
          style={contactButtonStyle("#edf0ea", "#203020")}
        >
          Call the owner · {PHONE_DISPLAY}
        </a>

        <a
          href={`mailto:${EMAIL}?subject=Cozy%20Garden%20feedback`}
          style={contactButtonStyle("#edf0ea", "#203020")}
        >
          Email the owner · {EMAIL}
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
