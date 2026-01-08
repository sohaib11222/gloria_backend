package com.carhire.sdk.transport;

import com.carhire.sdk.Config;
import com.carhire.sdk.TransportException;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import okhttp3.*;

import java.io.IOException;
import java.lang.reflect.Type;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

public class RestTransport implements TransportInterface {
    private final Config config;
    private final OkHttpClient httpClient;
    private final Gson gson;
    private final String baseUrl;

    public RestTransport(Config config) {
        this.config = config;
        this.gson = new Gson();
        this.baseUrl = config.get("baseUrl", "").toString().replaceAll("/$", "");

        int timeout = Math.max(
            (int) Math.ceil(((Number) config.get("longPollWaitMs", 10000)).doubleValue() + 2000) / 1000.0),
            12
        );

        this.httpClient = new OkHttpClient.Builder()
            .connectTimeout(timeout, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(timeout, java.util.concurrent.TimeUnit.SECONDS)
            .writeTimeout(timeout, java.util.concurrent.TimeUnit.SECONDS)
            .build();
    }

    private Map<String, String> buildHeaders(Map<String, String> extra) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Authorization", config.get("token", "").toString());
        headers.put("Content-Type", "application/json");
        headers.put("Accept", "application/json");
        headers.put("X-Agent-Id", config.get("agentId", "").toString());
        headers.put("X-Correlation-Id", config.get("correlationId", "").toString());

        Object apiKey = config.get("apiKey");
        if (apiKey != null && !apiKey.toString().isEmpty()) {
            headers.put("X-API-Key", apiKey.toString());
        }

        if (extra != null) {
            headers.putAll(extra);
        }

        return headers;
    }

    @Override
    public CompletableFuture<Map<String, Object>> availabilitySubmit(Map<String, Object> criteria) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                String json = gson.toJson(criteria);
                RequestBody body = RequestBody.create(json, MediaType.get("application/json; charset=utf-8"));

                Request request = new Request.Builder()
                    .url(baseUrl + "/availability/submit")
                    .post(body)
                    .headers(Headers.of(buildHeaders(null)))
                    .build();

                try (Response response = httpClient.newCall(request).execute()) {
                    if (!response.isSuccessful()) {
                        throw new TransportException("HTTP " + response.code() + ": " + response.message());
                    }
                    String responseBody = response.body().string();
                    Type type = new TypeToken<Map<String, Object>>(){}.getType();
                    return gson.fromJson(responseBody, type);
                }
            } catch (IOException e) {
                throw new RuntimeException(TransportException.fromHttp(e));
            }
        });
    }

    @Override
    public CompletableFuture<Map<String, Object>> availabilityPoll(String requestId, int sinceSeq, int waitMs) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                HttpUrl url = HttpUrl.parse(baseUrl + "/availability/poll").newBuilder()
                    .addQueryParameter("request_id", requestId)
                    .addQueryParameter("since_seq", String.valueOf(sinceSeq))
                    .addQueryParameter("wait_ms", String.valueOf(waitMs))
                    .build();

                Request request = new Request.Builder()
                    .url(url)
                    .get()
                    .headers(Headers.of(buildHeaders(null)))
                    .build();

                try (Response response = httpClient.newCall(request).execute()) {
                    if (!response.isSuccessful()) {
                        throw new TransportException("HTTP " + response.code() + ": " + response.message());
                    }
                    String responseBody = response.body().string();
                    Type type = new TypeToken<Map<String, Object>>(){}.getType();
                    return gson.fromJson(responseBody, type);
                }
            } catch (IOException e) {
                throw new RuntimeException(TransportException.fromHttp(e));
            }
        });
    }

    @Override
    public CompletableFuture<Boolean> isLocationSupported(String agreementRef, String locode) {
        return CompletableFuture.completedFuture(false);
    }

    @Override
    public CompletableFuture<Map<String, Object>> bookingCreate(Map<String, Object> payload, String idempotencyKey) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Map<String, String> headers = buildHeaders(null);
                if (idempotencyKey != null) {
                    headers.put("Idempotency-Key", idempotencyKey);
                }

                String json = gson.toJson(payload);
                RequestBody body = RequestBody.create(json, MediaType.get("application/json; charset=utf-8"));

                Request request = new Request.Builder()
                    .url(baseUrl + "/bookings")
                    .post(body)
                    .headers(Headers.of(headers))
                    .build();

                try (Response response = httpClient.newCall(request).execute()) {
                    if (!response.isSuccessful()) {
                        throw new TransportException("HTTP " + response.code() + ": " + response.message());
                    }
                    String responseBody = response.body().string();
                    Type type = new TypeToken<Map<String, Object>>(){}.getType();
                    return gson.fromJson(responseBody, type);
                }
            } catch (IOException e) {
                throw new RuntimeException(TransportException.fromHttp(e));
            }
        });
    }

    @Override
    public CompletableFuture<Map<String, Object>> bookingModify(Map<String, Object> payload) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                String agreementRef = payload.get("agreement_ref").toString();
                String supplierBookingRef = payload.get("supplier_booking_ref").toString();
                Object fields = payload.get("fields");

                String json = gson.toJson(fields);
                RequestBody body = RequestBody.create(json, MediaType.get("application/json; charset=utf-8"));

                HttpUrl url = HttpUrl.parse(baseUrl + "/bookings/" + supplierBookingRef).newBuilder()
                    .addQueryParameter("agreement_ref", agreementRef)
                    .build();

                Request request = new Request.Builder()
                    .url(url)
                    .patch(body)
                    .headers(Headers.of(buildHeaders(null)))
                    .build();

                try (Response response = httpClient.newCall(request).execute()) {
                    if (!response.isSuccessful()) {
                        throw new TransportException("HTTP " + response.code() + ": " + response.message());
                    }
                    String responseBody = response.body().string();
                    Type type = new TypeToken<Map<String, Object>>(){}.getType();
                    return gson.fromJson(responseBody, type);
                }
            } catch (IOException e) {
                throw new RuntimeException(TransportException.fromHttp(e));
            }
        });
    }

    @Override
    public CompletableFuture<Map<String, Object>> bookingCancel(Map<String, Object> payload) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                String agreementRef = payload.get("agreement_ref").toString();
                String supplierBookingRef = payload.get("supplier_booking_ref").toString();

                HttpUrl url = HttpUrl.parse(baseUrl + "/bookings/" + supplierBookingRef + "/cancel").newBuilder()
                    .addQueryParameter("agreement_ref", agreementRef)
                    .build();

                Request request = new Request.Builder()
                    .url(url)
                    .post(RequestBody.create("", MediaType.get("application/json; charset=utf-8")))
                    .headers(Headers.of(buildHeaders(null)))
                    .build();

                try (Response response = httpClient.newCall(request).execute()) {
                    if (!response.isSuccessful()) {
                        throw new TransportException("HTTP " + response.code() + ": " + response.message());
                    }
                    String responseBody = response.body().string();
                    Type type = new TypeToken<Map<String, Object>>(){}.getType();
                    return gson.fromJson(responseBody, type);
                }
            } catch (IOException e) {
                throw new RuntimeException(TransportException.fromHttp(e));
            }
        });
    }

    @Override
    public CompletableFuture<Map<String, Object>> bookingCheck(String supplierBookingRef, String agreementRef, String sourceId) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                HttpUrl.Builder urlBuilder = HttpUrl.parse(baseUrl + "/bookings/" + supplierBookingRef).newBuilder()
                    .addQueryParameter("agreement_ref", agreementRef);
                if (sourceId != null) {
                    urlBuilder.addQueryParameter("source_id", sourceId);
                }

                Request request = new Request.Builder()
                    .url(urlBuilder.build())
                    .get()
                    .headers(Headers.of(buildHeaders(null)))
                    .build();

                try (Response response = httpClient.newCall(request).execute()) {
                    if (!response.isSuccessful()) {
                        throw new TransportException("HTTP " + response.code() + ": " + response.message());
                    }
                    String responseBody = response.body().string();
                    Type type = new TypeToken<Map<String, Object>>(){}.getType();
                    return gson.fromJson(responseBody, type);
                }
            } catch (IOException e) {
                throw new RuntimeException(TransportException.fromHttp(e));
            }
        });
    }
}

