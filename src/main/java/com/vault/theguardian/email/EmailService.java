package com.vault.theguardian.email;

import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailService {
    private final JavaMailSender mailSender;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public void sendEmailVerificationCode(String toEmail, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(toEmail);
        message.setSubject("The Guardian Email Verification Code");
        message.setText(
                "VERIFY\n"+
                "Your email verification code is: " + code + "\n\n" +
                        "This code expires in 15 minutes."
        );
        mailSender.send(message);
    }

    public void sendPasswordResetCode(String toEmail, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(toEmail);
        message.setSubject("The Guardian Password Reset Code");
        message.setText(
                "Your password reset code is: " + code + "\n\n" +
                        "This code expires in 15 minutes.\n\n" +
                        "If you did not request this, ignore this email."
        );
        mailSender.send(message);
    }

    public void sendTwoFactorCode(String toEmail, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setTo(toEmail);
        message.setSubject("The Guardian 2FA Code");
        message.setText(
                "You have enabled 2FA \n"+
                "Your 2FA login code is: " + code + "\n\n" +
                        "This code expires in 10 minutes."
        );
        mailSender.send(message);
    }
}
