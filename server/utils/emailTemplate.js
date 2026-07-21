/**
 * Renders a responsive, table-based HTML email (inline styles only, no
 * external CSS/images) so it renders consistently across email clients
 * including older Outlook builds that don't support flexbox/grid.
 */
function renderActionEmail({ heading, bodyLines, buttonText, buttonUrl, footerNote }) {
  const paragraphs = bodyLines
    .map(
      (line) =>
        `<p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#3f3f46;">${line}</p>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
    <style>
      @media only screen and (max-width: 480px) {
        .email-container { width: 100% !important; }
        .email-padding { padding: 24px !important; }
        .email-button { display: block !important; width: 100% !important; box-sizing: border-box; }
      }
    </style>
  </head>
  <body style="margin:0; padding:0; background-color:#f3f4f6; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" class="email-container" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">
            <tr>
              <td style="background-color:#3f3f46; padding:20px 32px;">
                <span style="font-size:20px; font-weight:bold; color:#ffffff; font-family:Georgia, serif;">Elroy Concepts</span><br />
                <span style="font-size:11px; color:#e0142a; font-weight:bold; letter-spacing:0.5px;">POWER EQUIPMENTS AND ALUMINUM BALUSTRADE SYSTEMS</span>
              </td>
            </tr>
            <tr>
              <td class="email-padding" style="padding:32px;">
                <h1 style="margin:0 0 16px; font-size:20px; color:#3f3f46;">${heading}</h1>
                ${paragraphs}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                  <tr>
                    <td style="border-radius:8px; background-color:#e0142a;">
                      <a href="${buttonUrl}" class="email-button" style="display:inline-block; padding:12px 28px; font-size:15px; font-weight:bold; color:#ffffff; text-decoration:none; border-radius:8px;">${buttonText}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px; font-size:13px; color:#71717a;">If the button doesn't work, copy and paste this link into your browser:</p>
                <p style="margin:0; font-size:13px; word-break:break-all;"><a href="${buttonUrl}" style="color:#e0142a;">${buttonUrl}</a></p>
                ${footerNote ? `<p style="margin:24px 0 0; font-size:12px; color:#71717a;">${footerNote}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px; background-color:#f3f4f6; text-align:center;">
                <p style="margin:0; font-size:11px; color:#a1a1aa;">© ${new Date().getFullYear()} Elroy Concepts. All Rights Reserved.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = { renderActionEmail };
