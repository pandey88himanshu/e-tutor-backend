import nodemailer from "nodemailer";

export class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendOTPEmail(email, otp, username) {
    try {
      const info = await this.transporter.sendMail({
        from: `"${process.env.APP_NAME || "Your App"}" <${
          process.env.SMTP_FROM
        }>`,
        to: email,
        subject: "Verify Your Email - OTP Code",
        html: this.getOTPEmailTemplate(otp, username),
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("Email sending failed:", error);
      throw new Error("Failed to send OTP email");
    }
  }

  getOTPEmailTemplate(otp, username) {
    return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>OTP Verification</title>
      </head>
      <body style="
        margin: 0;
        padding: 0;
        background-color: rgb(248, 249, 251); /* gray-50 */
        font-family: Arial, Helvetica, sans-serif;
      ">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding: 40px 16px;">
              
              <!-- CARD -->
              <table width="100%" cellpadding="0" cellspacing="0" style="
                max-width: 480px;
                background-color: rgb(255, 255, 255);
                border-radius: 8px;
                padding: 32px;
              ">
                
                <!-- HEADER -->
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <h1 style="
                      margin: 0;
                      font-size: 32px;
                      line-height: 40px;
                      font-weight: 600;
                      color: rgb(24, 28, 35); /* gray-900 */
                    ">
                      Verify Your Email
                    </h1>
                  </td>
                </tr>

                <!-- GREETING -->
                <tr>
                  <td style="padding-bottom: 16px;">
                    <p style="
                      margin: 0;
                      font-size: 16px;
                      line-height: 22px;
                      color: rgb(55, 60, 71); /* gray-800 */
                    ">
                      Hello ${username || "there"},
                    </p>
                  </td>
                </tr>

                <!-- MESSAGE -->
                <tr>
                  <td style="padding-bottom: 24px;">
                    <p style="
                      margin: 0;
                      font-size: 14px;
                      line-height: 20px;
                      color: rgb(113, 118, 134); /* gray-600 */
                    ">
                      Use the OTP below to verify your account. This code is valid
                      for <strong>10 minutes</strong>.
                    </p>
                  </td>
                </tr>

                <!-- OTP BOX -->
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <div style="
                      display: inline-block;
                      padding: 16px 32px;
                      background-color: rgb(255, 239, 233); /* primary-100 */
                      border-radius: 6px;
                      font-size: 32px;
                      letter-spacing: 6px;
                      font-weight: 600;
                      color: rgb(255, 109, 61); /* primary-500 */
                    ">
                      ${otp}
                    </div>
                  </td>
                </tr>

                <!-- FOOTER TEXT -->
                <tr>
                  <td style="padding-bottom: 8px;">
                    <p style="
                      margin: 0;
                      font-size: 12px;
                      line-height: 16px;
                      color: rgb(149, 154, 165); /* gray-500 */
                    ">
                      If you did not request this, please ignore this email.
                    </p>
                  </td>
                </tr>

                <!-- SIGNATURE -->
                <tr>
                  <td style="padding-top: 16px;">
                    <p style="
                      margin: 0;
                      font-size: 12px;
                      color: rgb(176, 179, 189); /* gray-400 */
                    ">
                      — Team Support
                    </p>
                  </td>
                </tr>

              </table>
              <!-- END CARD -->

            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
  }
}
