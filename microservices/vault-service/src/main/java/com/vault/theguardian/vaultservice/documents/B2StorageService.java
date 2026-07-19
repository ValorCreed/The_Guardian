package com.vault.theguardian.vaultservice.documents;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.net.URI;
import java.util.Map;

@Service
public class B2StorageService {

    private final boolean enabled;
    private final String bucketName;
    private final S3Client s3Client;

    public B2StorageService(
            @Value("${storage.b2.enabled:false}") boolean enabled,
            @Value("${storage.b2.endpoint:}") String endpoint,
            @Value("${storage.b2.region:us-west-004}") String region,
            @Value("${storage.b2.bucket:}") String bucketName,
            @Value("${storage.b2.key-id:}") String keyId,
            @Value("${storage.b2.application-key:}") String applicationKey
    ) {
        this.enabled = enabled;
        this.bucketName = bucketName == null ? "" : bucketName.trim();

        if (!enabled) {
            this.s3Client = null;
            return;
        }

        if (endpoint == null || endpoint.isBlank()) {
            throw new IllegalStateException("storage.b2.endpoint must be set when B2 storage is enabled.");
        }

        if (this.bucketName.isBlank()) {
            throw new IllegalStateException("storage.b2.bucket must be set when B2 storage is enabled.");
        }

        if (keyId == null || keyId.isBlank() || applicationKey == null || applicationKey.isBlank()) {
            throw new IllegalStateException("storage.b2.key-id and storage.b2.application-key must be set when B2 storage is enabled.");
        }

        this.s3Client = S3Client.builder()
                .region(Region.of(region == null || region.isBlank() ? "us-west-004" : region.trim()))
                .endpointOverride(URI.create(endpoint.trim()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(keyId.trim(), applicationKey.trim())
                ))
                .serviceConfiguration(S3Configuration.builder()
                        .pathStyleAccessEnabled(true)
                        .build())
                .build();
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void putEncryptedObject(String key, byte[] encryptedBytes, String originalContentType) {
        ensureEnabled();

        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucketName)
                .key(key)
                .contentType("application/octet-stream")
                .metadata(Map.of(
                        "guardian-encrypted", "true",
                        "guardian-original-content-type", originalContentType == null ? "application/octet-stream" : originalContentType
                ))
                .build();

        s3Client.putObject(request, RequestBody.fromBytes(encryptedBytes));
    }

    public byte[] getEncryptedObject(String key) {
        ensureEnabled();

        GetObjectRequest request = GetObjectRequest.builder()
                .bucket(bucketName)
                .key(key)
                .build();

        ResponseBytes<GetObjectResponse> bytes = s3Client.getObjectAsBytes(request);
        return bytes.asByteArray();
    }

    public void deleteObjectQuietly(String key) {
        if (!enabled || key == null || key.isBlank()) return;

        try {
            DeleteObjectRequest request = DeleteObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .build();

            s3Client.deleteObject(request);
        } catch (Exception ignored) {
            // Deleting the database row should not fail only because object cleanup failed.
        }
    }

    private void ensureEnabled() {
        if (!enabled || s3Client == null) {
            throw new IllegalStateException("Backblaze B2 storage is not enabled.");
        }
    }

    @PreDestroy
    public void close() {
        if (s3Client != null) {
            s3Client.close();
        }
    }
}
