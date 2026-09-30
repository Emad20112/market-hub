SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict lDKvtWIrZSW5rCu1TuvMYeBcv0MHJdOZkzdNIOPjuYn8egBtmrtcxgTKimwzqUj

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."audit_log_entries" ("instance_id", "id", "payload", "created_at", "ip_address") FROM stdin;
\.


--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."custom_oauth_providers" ("id", "provider_type", "identifier", "name", "client_id", "client_secret", "acceptable_client_ids", "scopes", "pkce_enabled", "attribute_mapping", "authorization_params", "enabled", "email_optional", "issuer", "discovery_url", "skip_nonce_check", "cached_discovery", "discovery_cached_at", "authorization_url", "token_url", "userinfo_url", "jwks_uri", "created_at", "updated_at", "custom_claims_allowlist") FROM stdin;
\.


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."flow_state" ("id", "user_id", "auth_code", "code_challenge_method", "code_challenge", "provider_type", "provider_access_token", "provider_refresh_token", "created_at", "updated_at", "authentication_method", "auth_code_issued_at", "invite_token", "referrer", "oauth_client_state_id", "linking_target_id", "email_optional") FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") FROM stdin;
00000000-0000-0000-0000-000000000000	ef8142de-d644-4bd6-aa37-5613b041e0ad	authenticated	authenticated	mousa.mc13@gmail.com	$2a$10$WJJDsfnrY4Z7ESO6inlyg.EY86WjshK2UDkjALZsWOooXC6lrwn3C	2026-09-16 00:18:54.566866+00	\N		\N		\N			\N	2026-09-29 21:25:09.284468+00	{"provider": "email", "providers": ["email"]}	{"full_name": "???? - ?????? ????", "email_verified": true}	\N	2026-09-16 00:18:54.551245+00	2026-09-29 21:25:09.323615+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	a9d8394f-8572-40f2-baaf-78e63e4ba571	authenticated	authenticated	jmnayjmnay9@gmail.com	$2a$10$TIbg1976qC76C9zuBYV6R.n9jbHbs9bTkyyZXkMZbqX8cMdrPRde2	2026-09-11 21:25:38.626461+00	\N		\N		\N			\N	2026-09-29 04:15:45.760357+00	{"provider": "email", "providers": ["email"]}	{"full_name": "??????", "email_verified": true}	\N	2026-09-11 21:25:38.582694+00	2026-09-29 04:15:45.787108+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	7ae4823c-0946-4765-96f9-881dbf42b316	authenticated	authenticated	fyslbdh80@gmail.com	$2a$10$W2NjLrT3Il0v0JE.DxAwAu9iThe9EhclXByPZy2L4i4sCw/bS4PPW	2026-09-12 22:27:13.605289+00	\N		2026-09-12 22:01:49.072469+00		\N			\N	2026-09-14 00:08:59.916638+00	{"provider": "email", "providers": ["email"]}	{"sub": "7ae4823c-0946-4765-96f9-881dbf42b316", "email": "fyslbdh80@gmail.com", "full_name": "عماد الجماعي", "email_verified": true, "phone_verified": false}	\N	2026-09-12 22:01:48.969358+00	2026-09-27 21:09:28.313179+00	\N	\N			\N		0	\N		\N	f	\N	f
\.


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") FROM stdin;
a9d8394f-8572-40f2-baaf-78e63e4ba571	a9d8394f-8572-40f2-baaf-78e63e4ba571	{"sub": "a9d8394f-8572-40f2-baaf-78e63e4ba571", "email": "jmnayjmnay9@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-09-11 21:25:38.618871+00	2026-09-11 21:25:38.618931+00	2026-09-11 21:25:38.618931+00	548d1ee3-60d6-45be-857e-f23e78e22c51
7ae4823c-0946-4765-96f9-881dbf42b316	7ae4823c-0946-4765-96f9-881dbf42b316	{"sub": "7ae4823c-0946-4765-96f9-881dbf42b316", "email": "fyslbdh80@gmail.com", "full_name": "عماد الجماعي", "email_verified": true, "phone_verified": false}	email	2026-09-12 22:01:49.053845+00	2026-09-12 22:01:49.0539+00	2026-09-12 22:01:49.0539+00	fa636d7c-4cb4-4542-b68a-50b7de910faf
ef8142de-d644-4bd6-aa37-5613b041e0ad	ef8142de-d644-4bd6-aa37-5613b041e0ad	{"sub": "ef8142de-d644-4bd6-aa37-5613b041e0ad", "email": "mousa.mc13@gmail.com", "email_verified": false, "phone_verified": false}	email	2026-09-16 00:18:54.562168+00	2026-09-16 00:18:54.56223+00	2026-09-16 00:18:54.56223+00	4df03b87-ec36-43fa-95b0-e31bd1666a1d
\.


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."instances" ("id", "uuid", "raw_base_config", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_clients" ("id", "client_secret_hash", "registration_type", "redirect_uris", "grant_types", "client_name", "client_uri", "logo_uri", "created_at", "updated_at", "deleted_at", "client_type", "token_endpoint_auth_method") FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") FROM stdin;
a73a46cd-a0af-4563-8d9f-3cabaa76d4a5	ef8142de-d644-4bd6-aa37-5613b041e0ad	2026-09-29 21:25:09.284554+00	2026-09-29 21:25:09.284554+00	\N	aal1	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0	175.110.58.188	\N	\N	\N	\N	\N
9e35bf84-fcad-47d1-9bc3-4492f84c17ad	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-29 04:13:49.739631+00	2026-09-29 04:13:49.739631+00	\N	aal1	\N	\N	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.7 Mobile/15E148 Safari/604.1	185.183.33.14	\N	\N	\N	\N	\N
ec59fa1d-0ff4-4bac-ab2f-95219f87317b	ef8142de-d644-4bd6-aa37-5613b041e0ad	2026-09-29 20:07:20.425258+00	2026-09-29 21:07:14.416204+00	\N	aal1	\N	2026-09-29 21:07:14.412905	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36	175.110.58.188	\N	\N	\N	\N	\N
be083641-422b-48c2-80ea-2a56e295fe60	7ae4823c-0946-4765-96f9-881dbf42b316	2026-09-14 00:08:02.007127+00	2026-09-14 00:08:02.007127+00	\N	aal1	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36	134.35.175.215	\N	\N	\N	\N	\N
cc15ef3e-8682-4201-bac0-a780ab156fe4	7ae4823c-0946-4765-96f9-881dbf42b316	2026-09-14 00:08:59.916766+00	2026-09-27 21:09:28.330817+00	\N	aal1	\N	2026-09-27 21:09:28.330672	Mozilla/5.0 (iPhone; CPU iPhone OS 26_3_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/145.0.7632.41 Mobile/15E148 Safari/604.1	134.35.251.52	\N	\N	\N	\N	\N
94fb425a-b416-4497-b30b-2ed6dced30ef	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 09:42:45.465523+00	2026-09-29 01:41:32.971271+00	\N	aal1	\N	2026-09-29 01:41:32.97111	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Mobile Safari/537.36	78.137.70.72	\N	\N	\N	\N	\N
04dd6d3b-4ce4-47c1-9f85-5bbd39a52b15	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-29 02:01:48.56874+00	2026-09-29 02:01:48.56874+00	\N	aal1	\N	\N	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.7 Mobile/15E148 Safari/604.1	185.183.33.19	\N	\N	\N	\N	\N
f01f5f93-a354-491f-a0ab-31d5a80c7cff	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-29 04:15:45.760473+00	2026-09-29 04:15:45.760473+00	\N	aal1	\N	\N	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.7 Mobile/15E148 Safari/604.1	185.183.33.14	\N	\N	\N	\N	\N
\.


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") FROM stdin;
9e35bf84-fcad-47d1-9bc3-4492f84c17ad	2026-09-29 04:13:49.829446+00	2026-09-29 04:13:49.829446+00	password	fc82d02e-e621-4cf2-8626-e739da64cb2a
f01f5f93-a354-491f-a0ab-31d5a80c7cff	2026-09-29 04:15:45.790183+00	2026-09-29 04:15:45.790183+00	password	7b0c5cc6-16b9-4824-b414-50300ca5a274
ec59fa1d-0ff4-4bac-ab2f-95219f87317b	2026-09-29 20:07:20.508014+00	2026-09-29 20:07:20.508014+00	password	92331bc5-6d22-42ff-b893-b33bdab27541
a73a46cd-a0af-4563-8d9f-3cabaa76d4a5	2026-09-29 21:25:09.341411+00	2026-09-29 21:25:09.341411+00	password	16b3e9f8-818e-463a-8fc7-f22f5044c620
be083641-422b-48c2-80ea-2a56e295fe60	2026-09-14 00:08:02.025232+00	2026-09-14 00:08:02.025232+00	password	3c988a2e-c579-4f1d-9f51-6dba6b1c3955
cc15ef3e-8682-4201-bac0-a780ab156fe4	2026-09-14 00:08:59.919615+00	2026-09-14 00:08:59.919615+00	password	fd6fa4e5-6a00-427c-b760-38073579b3bf
94fb425a-b416-4497-b30b-2ed6dced30ef	2026-09-27 09:42:45.560893+00	2026-09-27 09:42:45.560893+00	password	22c45b8c-0b6b-4f16-9d85-16235a2fba0b
04dd6d3b-4ce4-47c1-9f85-5bbd39a52b15	2026-09-29 02:01:48.596078+00	2026-09-29 02:01:48.596078+00	password	e23b038e-d1f2-47f6-9c17-8945aff8e0ae
\.


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."mfa_factors" ("id", "user_id", "friendly_name", "factor_type", "status", "created_at", "updated_at", "secret", "phone", "last_challenged_at", "web_authn_credential", "web_authn_aaguid", "last_webauthn_challenge_data") FROM stdin;
\.


--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."mfa_challenges" ("id", "factor_id", "created_at", "verified_at", "ip_address", "otp_code", "web_authn_session_data") FROM stdin;
\.


--
-- Data for Name: mfa_recovery_code_sets; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."mfa_recovery_code_sets" ("id", "user_id", "mfa_factor_id", "failed_verification_count", "verification_locked_until", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: mfa_recovery_codes; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."mfa_recovery_codes" ("id", "mfa_recovery_code_set_id", "code_hash", "consumed_at", "created_at") FROM stdin;
\.


--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_authorizations" ("id", "authorization_id", "client_id", "user_id", "redirect_uri", "scope", "state", "resource", "code_challenge", "code_challenge_method", "response_type", "status", "authorization_code", "created_at", "expires_at", "approved_at", "nonce") FROM stdin;
\.


--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_client_states" ("id", "provider_type", "code_verifier", "created_at") FROM stdin;
\.


--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_consents" ("id", "user_id", "client_id", "scopes", "granted_at", "revoked_at") FROM stdin;
\.


--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."one_time_tokens" ("id", "user_id", "token_type", "token_hash", "relates_to", "created_at", "updated_at", "expires_at") FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") FROM stdin;
00000000-0000-0000-0000-000000000000	350	sc5tlj7knc4p	a9d8394f-8572-40f2-baaf-78e63e4ba571	f	2026-09-29 04:13:49.78575+00	2026-09-29 04:13:49.78575+00	\N	9e35bf84-fcad-47d1-9bc3-4492f84c17ad
00000000-0000-0000-0000-000000000000	88	etwnpzin7emg	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-15 21:42:40.31139+00	2026-09-22 22:04:32.640348+00	zrpdfyp3ij6r	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	353	minusswq627b	ef8142de-d644-4bd6-aa37-5613b041e0ad	f	2026-09-29 21:07:14.387614+00	2026-09-29 21:07:14.387614+00	ljxc53ex2xxy	ec59fa1d-0ff4-4bac-ab2f-95219f87317b
00000000-0000-0000-0000-000000000000	291	afpa7xnyel5a	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-27 15:06:38.104023+00	2026-09-27 16:24:18.838313+00	4cza776ztazt	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	294	xbihjngiz3tq	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-27 17:23:56.007758+00	2026-09-27 18:37:07.17222+00	adik5j3gytxx	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	297	khtpkl7hd4y4	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-27 20:34:17.852566+00	2026-09-27 21:57:54.193004+00	ashzgzg6sfyr	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	153	57ajhyuoizmt	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-22 22:04:32.650465+00	2026-09-22 23:32:23.256522+00	etwnpzin7emg	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	300	zksofzlgaquh	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-27 21:57:54.21576+00	2026-09-27 23:26:48.878942+00	khtpkl7hd4y4	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	74	ylxz76qodjuh	7ae4823c-0946-4765-96f9-881dbf42b316	f	2026-09-14 00:08:02.018973+00	2026-09-14 00:08:02.018973+00	\N	be083641-422b-48c2-80ea-2a56e295fe60
00000000-0000-0000-0000-000000000000	156	kbgmvuigxoil	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-22 23:32:23.267415+00	2026-09-23 03:15:42.722375+00	57ajhyuoizmt	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	75	4rcctjbo7vo7	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-14 00:08:59.918002+00	2026-09-14 19:25:36.178118+00	\N	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	78	gvcaf53bxbtg	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-14 19:25:36.192208+00	2026-09-14 23:25:53.521178+00	4rcctjbo7vo7	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	79	ek5q7e7h2yuq	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-14 23:25:53.537185+00	2026-09-15 01:48:25.351007+00	gvcaf53bxbtg	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	83	sbqox5bftin6	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-15 01:48:25.361214+00	2026-09-15 18:20:03.512547+00	ek5q7e7h2yuq	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	84	zrpdfyp3ij6r	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-15 18:20:03.530687+00	2026-09-15 21:42:40.298165+00	sbqox5bftin6	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	165	y6g25bkr4wbi	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-23 03:15:42.736098+00	2026-09-25 02:51:39.003685+00	kbgmvuigxoil	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	351	saylzs4knke7	a9d8394f-8572-40f2-baaf-78e63e4ba571	f	2026-09-29 04:15:45.783449+00	2026-09-29 04:15:45.783449+00	\N	f01f5f93-a354-491f-a0ab-31d5a80c7cff
00000000-0000-0000-0000-000000000000	354	orstasf5dssv	ef8142de-d644-4bd6-aa37-5613b041e0ad	f	2026-09-29 21:25:09.316041+00	2026-09-29 21:25:09.316041+00	\N	a73a46cd-a0af-4563-8d9f-3cabaa76d4a5
00000000-0000-0000-0000-000000000000	289	bqaa5z5f57dz	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-27 09:42:45.507328+00	2026-09-27 13:50:29.614955+00	\N	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	295	kfnn47dcuror	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-27 18:37:07.193661+00	2026-09-27 19:35:19.74087+00	xbihjngiz3tq	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	265	kbqbrok5vyou	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-26 19:12:53.26064+00	2026-09-27 21:09:28.295603+00	gzpbi2k4gewa	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	298	fejjzuom2r22	7ae4823c-0946-4765-96f9-881dbf42b316	f	2026-09-27 21:09:28.307779+00	2026-09-27 21:09:28.307779+00	kbqbrok5vyou	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	243	3mva7f4di5xy	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-25 02:51:39.009751+00	2026-09-25 19:20:38.621895+00	y6g25bkr4wbi	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	323	y5h4lx66cc57	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-28 14:40:13.600574+00	2026-09-28 15:38:32.832573+00	nb44ynkfwfg2	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	326	vmffrktrdeay	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-28 17:34:18.6867+00	2026-09-28 19:21:36.864421+00	34nkmiigywe6	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	329	bkvyuarun6tc	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-28 19:21:36.879042+00	2026-09-29 01:41:32.94493+00	vmffrktrdeay	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	253	gzpbi2k4gewa	7ae4823c-0946-4765-96f9-881dbf42b316	t	2026-09-25 19:20:38.643998+00	2026-09-26 19:12:53.252841+00	3mva7f4di5xy	cc15ef3e-8682-4201-bac0-a780ab156fe4
00000000-0000-0000-0000-000000000000	352	ljxc53ex2xxy	ef8142de-d644-4bd6-aa37-5613b041e0ad	t	2026-09-29 20:07:20.47102+00	2026-09-29 21:07:14.368099+00	\N	ec59fa1d-0ff4-4bac-ab2f-95219f87317b
00000000-0000-0000-0000-000000000000	290	4cza776ztazt	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-27 13:50:29.6335+00	2026-09-27 15:06:38.094143+00	bqaa5z5f57dz	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	293	adik5j3gytxx	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-27 16:24:18.848466+00	2026-09-27 17:23:55.99157+00	afpa7xnyel5a	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	296	ashzgzg6sfyr	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-27 19:35:19.751913+00	2026-09-27 20:34:17.843895+00	kfnn47dcuror	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	306	xssc2oznm36m	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-27 23:26:48.890111+00	2026-09-28 00:25:10.39732+00	zksofzlgaquh	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	309	3nesgzmgpy6l	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-28 00:25:10.405885+00	2026-09-28 13:12:15.449191+00	xssc2oznm36m	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	321	nb44ynkfwfg2	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-28 13:12:15.469769+00	2026-09-28 14:40:13.593399+00	3nesgzmgpy6l	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	324	34nkmiigywe6	a9d8394f-8572-40f2-baaf-78e63e4ba571	t	2026-09-28 15:38:32.849126+00	2026-09-28 17:34:18.664525+00	y5h4lx66cc57	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	345	blhza2amxz2i	a9d8394f-8572-40f2-baaf-78e63e4ba571	f	2026-09-29 01:41:32.951319+00	2026-09-29 01:41:32.951319+00	bkvyuarun6tc	94fb425a-b416-4497-b30b-2ed6dced30ef
00000000-0000-0000-0000-000000000000	349	tmokf46d67pz	a9d8394f-8572-40f2-baaf-78e63e4ba571	f	2026-09-29 02:01:48.585978+00	2026-09-29 02:01:48.585978+00	\N	04dd6d3b-4ce4-47c1-9f85-5bbd39a52b15
\.


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."sso_providers" ("id", "resource_id", "created_at", "updated_at", "disabled") FROM stdin;
\.


--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."saml_providers" ("id", "sso_provider_id", "entity_id", "metadata_xml", "metadata_url", "attribute_mapping", "created_at", "updated_at", "name_id_format") FROM stdin;
\.


--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."saml_relay_states" ("id", "sso_provider_id", "request_id", "for_email", "redirect_to", "created_at", "updated_at", "flow_state_id") FROM stdin;
\.


--
-- Data for Name: scim_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."scim_tokens" ("id", "sso_provider_id", "token_hash", "prefix", "created_at", "expires_at", "revoked_at", "last_used_at") FROM stdin;
\.


--
-- Data for Name: scim_users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."scim_users" ("id", "sso_provider_id", "user_id", "resource", "created_at", "updated_at", "deleted_at") FROM stdin;
\.


--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."sso_domains" ("id", "sso_provider_id", "domain", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."webauthn_challenges" ("id", "user_id", "challenge_type", "session_data", "created_at", "expires_at") FROM stdin;
\.


--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."webauthn_credentials" ("id", "user_id", "credential_id", "public_key", "attestation_type", "aaguid", "sign_count", "transports", "backup_eligible", "backed_up", "friendly_name", "created_at", "updated_at", "last_used_at") FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."audit_logs" ("id", "actor_id", "action", "entity_type", "entity_id", "payload", "created_at") FROM stdin;
3d5bd8a0-9efd-43e3-8304-ac8a8a52e9cb	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	f38b6f81-369e-4556-9455-7500eb3b6b1e	{"paid": 6000.00, "total": 6000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0015", "payment_method": "cash"}	2026-09-11 22:01:23.013304+00
3941dd5d-8f5a-40d6-9e4f-4919078ff55d	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	540592a1-f945-4783-b6cf-d8f074a5321a	{"paid": 2000.00, "total": 2000.00, "customer_id": "525b299e-0250-439a-9cff-cdffab0eec8e", "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0016", "payment_method": "cash"}	2026-09-11 22:02:33.276464+00
ea55e2e7-1cf6-4247-84d8-777714bfcb7a	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	adbe73a4-96bf-4059-986d-43b367b12ab1	{"paid": 2000.00, "total": 2000.00, "customer_id": "4306c963-8626-48fc-9c7e-18bb33718010", "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0017", "payment_method": "cash"}	2026-09-11 22:04:16.25063+00
16f7215e-9af1-4bc3-9eba-97c43f66d3dd	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	c67529d8-e315-4558-b8da-d0c537b96da2	{"paid": 2000.00, "total": 2000.00, "customer_id": "4306c963-8626-48fc-9c7e-18bb33718010", "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0018", "payment_method": "cash"}	2026-09-11 22:05:14.242661+00
e04710aa-7f54-4942-a8c2-1d94477edbe6	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	372c22aa-cbd8-4a4b-9dd7-77a4d5d330a0	{"paid": 2000.00, "total": 2000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0019", "payment_method": "cash"}	2026-09-13 18:20:40.29402+00
c14f4341-9b49-4209-ad5d-1775bffba742	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	7fe4a885-d887-46c7-b1fb-3447a58cd93f	{"paid": 2000.00, "total": 2000.00, "customer_id": "3897b29a-88c0-4524-82e2-e0188d809a6d", "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0020", "payment_method": "cash"}	2026-09-13 18:28:14.356778+00
2961875e-fae0-4cd6-b47e-f2f87a8079e4	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	a531a07a-1c02-40c0-9fe9-2c5207b5e048	{"paid": 1000, "total": 2000.00, "customer_id": "3897b29a-88c0-4524-82e2-e0188d809a6d", "outstanding": 1000.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0021", "payment_method": "credit"}	2026-09-13 18:29:39.802887+00
27698b9e-4ce8-4f1e-83d1-8e573cead2c4	a9d8394f-8572-40f2-baaf-78e63e4ba571	customer_payment.recorded	customer	3897b29a-88c0-4524-82e2-e0188d809a6d	{"amount": 300, "method": "cash", "invoice_id": null, "payment_date": "2026-09-13"}	2026-09-13 18:33:50.446296+00
9dc1e40f-90ac-430d-aa69-583588146883	a9d8394f-8572-40f2-baaf-78e63e4ba571	customer_payment.recorded	customer	3897b29a-88c0-4524-82e2-e0188d809a6d	{"amount": 300, "method": "cash", "invoice_id": "a531a07a-1c02-40c0-9fe9-2c5207b5e048", "payment_date": "2026-09-13"}	2026-09-13 18:33:52.511367+00
37656ca7-5a1e-4b9d-8487-254ba897fadd	a9d8394f-8572-40f2-baaf-78e63e4ba571	customer_payment.recorded	customer	3897b29a-88c0-4524-82e2-e0188d809a6d	{"amount": 300, "method": "cash", "invoice_id": "a531a07a-1c02-40c0-9fe9-2c5207b5e048", "payment_date": "2026-09-13"}	2026-09-13 18:35:57.405925+00
e94f63c7-744b-49ac-b5ea-c2eeb898c7c1	a9d8394f-8572-40f2-baaf-78e63e4ba571	customer_payment.recorded	customer	3897b29a-88c0-4524-82e2-e0188d809a6d	{"amount": 50, "method": "cash", "invoice_id": "a531a07a-1c02-40c0-9fe9-2c5207b5e048", "payment_date": "2026-09-13"}	2026-09-13 18:37:09.080394+00
bee25690-d040-41d9-82c2-f628d352eccf	a9d8394f-8572-40f2-baaf-78e63e4ba571	customer_payment.recorded	customer	3897b29a-88c0-4524-82e2-e0188d809a6d	{"amount": 50, "method": "cash", "invoice_id": "a531a07a-1c02-40c0-9fe9-2c5207b5e048", "payment_date": "2026-09-13"}	2026-09-13 18:41:32.505185+00
0e2dc560-aa11-4344-b4b9-3a3e29d5c8d4	7ae4823c-0946-4765-96f9-881dbf42b316	sale.posted	sales_invoice	b309ab20-4cc4-4e89-b5c2-4b3b499a1911	{"paid": 6000.00, "total": 6000.00, "customer_id": "3897b29a-88c0-4524-82e2-e0188d809a6d", "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0022", "payment_method": "cash"}	2026-09-13 18:44:34.358989+00
28ac3854-7c8d-4258-8c0d-6e65ae00c5af	7ae4823c-0946-4765-96f9-881dbf42b316	sale.posted	sales_invoice	e336b2d5-ebdd-478d-a287-88a2ee707017	{"paid": 2000.00, "total": 2000.00, "customer_id": "3897b29a-88c0-4524-82e2-e0188d809a6d", "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0023", "payment_method": "cash"}	2026-09-13 18:45:39.116943+00
183237f1-ba58-4d9f-b291-2d737cd790de	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	2b2510d8-c3a1-48f7-94e1-a319fedc1813	{"paid": 8000.00, "total": 8000.00, "customer_id": "3897b29a-88c0-4524-82e2-e0188d809a6d", "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0024", "payment_method": "cash"}	2026-09-13 18:46:49.835627+00
a4acdd49-2033-4ecc-b422-67beb321d786	7ae4823c-0946-4765-96f9-881dbf42b316	sale.posted	sales_invoice	19867440-11a6-4983-a114-788bc5967f6c	{"paid": 2000.00, "total": 2000.00, "customer_id": "3897b29a-88c0-4524-82e2-e0188d809a6d", "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0025", "payment_method": "cash"}	2026-09-13 18:47:39.717244+00
be60e961-b936-473d-a8d6-f1662ec34083	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	b0e40c78-78be-4b11-9330-eb4b455ae2c3	{"paid": 0, "total": 2000.00, "customer_id": "d95b54fc-3c9b-41b5-b322-198b6642ca5d", "outstanding": 2000.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0026", "payment_method": "credit"}	2026-09-13 18:52:25.725916+00
a30bc393-68f4-4e25-830d-539d3a7b3032	7ae4823c-0946-4765-96f9-881dbf42b316	customer_payment.recorded	customer	d95b54fc-3c9b-41b5-b322-198b6642ca5d	{"amount": 500, "method": "cash", "invoice_id": null, "payment_date": "2026-09-13"}	2026-09-13 19:01:41.315407+00
b5906e2b-4c0c-40fd-877b-82cb1ce7c37b	7ae4823c-0946-4765-96f9-881dbf42b316	customer_payment.recorded	customer	d95b54fc-3c9b-41b5-b322-198b6642ca5d	{"amount": 500, "method": "cash", "invoice_id": "b0e40c78-78be-4b11-9330-eb4b455ae2c3", "payment_date": "2026-09-13"}	2026-09-13 20:37:50.520897+00
fae1272b-ea15-45ad-9290-59b5557d33fb	7ae4823c-0946-4765-96f9-881dbf42b316	sale.posted	sales_invoice	883b7cf8-a563-4487-b10e-a8d56527671a	{"paid": 2000.00, "total": 2000.00, "customer_id": "3897b29a-88c0-4524-82e2-e0188d809a6d", "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0027", "payment_method": "cash"}	2026-09-13 20:41:50.701312+00
3dde30c5-ba2a-43c4-8eb1-e8f30656e934	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	c3088e2e-a858-4529-b4d5-49dd4cd71db3	{"paid": 2000.00, "total": 2000.00, "customer_id": "09256e63-7ceb-4c50-83ba-352ee32e126b", "outstanding": 0.00, "warehouse_id": "1193f381-6640-44c8-9ca4-5c35cabd9ec3", "invoice_number": "INV--202609-0028", "payment_method": "cash"}	2026-09-14 00:25:40.824115+00
4e04e58f-ee94-41b1-ba13-79de6fb91062	7ae4823c-0946-4765-96f9-881dbf42b316	customer_payment.recorded	customer	d95b54fc-3c9b-41b5-b322-198b6642ca5d	{"amount": 500, "method": "cash", "invoice_id": null, "payment_date": "2026-09-14"}	2026-09-14 00:35:52.240711+00
eae9b9f3-7533-4316-b171-0166ce51fbb8	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	f87b66b8-9a03-4269-8377-02f9df4ea05b	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0029", "payment_method": "cash"}	2026-09-19 13:28:55.094964+00
1b090cfe-714e-4c32-9c51-f7b20d1f276c	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	3666e67a-f47b-404c-a6c4-54306a1be3f9	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0030", "payment_method": "cash"}	2026-09-19 13:29:44.280304+00
d1eadea5-54b3-46c4-9a08-9b80774cbd3e	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	775efdc9-3492-4e7c-bf20-ca8cb4559a01	{"paid": 3700.00, "total": 3700.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0031", "payment_method": "cash"}	2026-09-20 16:53:48.521228+00
78bb65fc-b81a-4544-8018-bc73930a10fa	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	8c8e674d-b7b5-4b5f-bb7d-650d91a45378	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0032", "payment_method": "cash"}	2026-09-20 17:06:11.582872+00
4fb4ffab-e948-4199-9ad3-3dda9639e36f	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	b5255f7e-8776-46f4-ac39-f9bc64465517	{"paid": 2200, "total": 2200.00, "customer_id": "c8f5c892-255e-4287-966a-49e2594c7576", "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0033", "payment_method": "credit"}	2026-09-20 17:18:56.842415+00
40e24edd-8086-47f9-8df9-a4c914112f9f	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	92c9ef18-e371-4ec6-ae41-ad67e38a87aa	{"paid": 200.00, "total": 200.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0034", "payment_method": "cash"}	2026-09-20 18:27:09.565503+00
7fae4e80-184e-423b-8f50-45b231f7d61b	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	9174dd78-2d30-43eb-9142-c9769f9358ad	{"paid": 2200.00, "total": 2200.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0035", "payment_method": "cash"}	2026-09-20 18:44:33.528892+00
5c916690-2e36-4dcf-a3b7-8f1c8ea9f760	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	89caff9a-1d37-47bf-b020-1e61ad6dcf49	{"paid": 2000.00, "total": 2000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0036", "payment_method": "cash"}	2026-09-20 19:18:38.189463+00
59018464-8833-47ca-bfef-76091bacc9bd	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	16f1737d-9897-4dd7-aaa2-d65036946600	{"paid": 0, "total": 2600.00, "customer_id": "4885e843-1ad8-47f7-ad57-57522663543c", "outstanding": 2600.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0037", "payment_method": "credit"}	2026-09-20 19:33:35.251356+00
e98437ce-84b4-4112-805a-011270640ba9	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	86f93f21-f27a-4b22-bfde-54d5ef19089e	{"paid": 0, "total": 2200.00, "customer_id": "7c110c35-0cd6-45e9-ac38-c8b8295fdde5", "outstanding": 2200.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0038", "payment_method": "credit"}	2026-09-20 19:34:33.752097+00
293d05d4-5220-4635-b1ce-7e8642aadbfd	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	58dad026-29bf-4006-97c9-b63649a2000d	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0039", "payment_method": "cash"}	2026-09-20 20:32:05.47657+00
496d17a3-b1bf-4ad4-996e-053b800f0926	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	3944e543-a181-43e9-b349-52f2cd909e31	{"paid": 0, "total": 30275.00, "customer_id": "0846714f-45d7-40e4-9a15-1cae5e0fea09", "outstanding": 30275.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0040", "payment_method": "credit"}	2026-09-20 23:51:13.729458+00
2f9edb4a-23d3-4f25-9a62-ebc963bb749d	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	83007bfb-ab57-474f-abcc-2d7a9e6127a1	{"paid": 0, "total": 1000.00, "customer_id": "4885e843-1ad8-47f7-ad57-57522663543c", "outstanding": 1000.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0041", "payment_method": "credit"}	2026-09-21 00:05:11.785194+00
7ba9a041-41fd-41f3-884d-0781b3118ef8	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	3e4c3f63-1044-4314-8d0d-c68ed208d698	{"paid": 0, "total": 1750.00, "customer_id": "c70082c8-535b-4022-8881-f029fbb069b4", "outstanding": 1750.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0042", "payment_method": "credit"}	2026-09-21 00:10:54.669446+00
f44b0a53-8a5a-46ea-81e4-deaebd72483a	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	9a2793db-9c35-49ac-b135-cf96c85f7362	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0043", "payment_method": "cash"}	2026-09-21 00:43:07.255057+00
572ba4dc-8af2-4390-8f6c-aad698f606fb	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	fd925239-b9a9-49a3-a794-9970ca9036a7	{"paid": 12000.00, "total": 12000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0044", "payment_method": "cash"}	2026-09-21 01:02:23.42689+00
5ae1fcc7-14af-4c58-9967-2d3418c91c72	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	97b0c3d9-5abb-4887-96de-723d651c0436	{"paid": 3000.00, "total": 3000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0045", "payment_method": "cash"}	2026-09-21 14:16:50.416594+00
6fb2426a-5a0a-4554-91d0-825f6c975d24	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	6450f56e-fed2-4574-9099-912d55b30f02	{"paid": 0, "total": 1000.00, "customer_id": "4885e843-1ad8-47f7-ad57-57522663543c", "outstanding": 1000.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0046", "payment_method": "credit"}	2026-09-21 14:26:15.55552+00
77fe4d8d-f758-4508-a10e-f69aa6dbbd71	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	6aa9a0dd-0a22-468f-b711-980ad6c85d26	{"paid": 0, "total": 2400.00, "customer_id": "4885e843-1ad8-47f7-ad57-57522663543c", "outstanding": 2400.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0047", "payment_method": "credit"}	2026-09-21 14:27:58.390452+00
90e5faa5-2364-4c11-9d34-63b50434ff2a	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	119f43b8-2150-4449-b525-b25e126e8519	{"paid": 0, "total": 100.00, "customer_id": "4885e843-1ad8-47f7-ad57-57522663543c", "outstanding": 100.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0048", "payment_method": "credit"}	2026-09-21 14:49:25.837455+00
4bfa397a-bdd7-4177-9dc6-6cd2152a131a	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	148695ef-ff2b-49fc-848e-542cf947a9cc	{"paid": 11400.00, "total": 11400.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0049", "payment_method": "cash"}	2026-09-21 18:15:50.836514+00
45416481-cc55-4dce-8ffa-a124a031fcce	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	ccc02089-567e-4d2f-ab10-332437446517	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0050", "payment_method": "cash"}	2026-09-21 18:19:50.649521+00
22fb08bd-575b-4593-95f7-80d45274bdd5	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	7af64206-af9b-485f-a3e6-97a877675f24	{"paid": 300.00, "total": 300.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0051", "payment_method": "cash"}	2026-09-21 18:20:48.734009+00
d6378964-022b-4a30-90da-121e97df7855	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	50d9f6fa-dbc2-47a4-b478-4a56d6f12218	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0052", "payment_method": "cash"}	2026-09-21 18:24:43.957763+00
0c08a9bc-96f3-4642-ae39-6a5a7664982a	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	a2def70e-e60f-47e0-b452-e2d91e282bac	{"paid": 750.00, "total": 750.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0053", "payment_method": "cash"}	2026-09-21 18:29:04.416622+00
81c398cb-5e59-4bb7-81ed-e52c6779ff33	ef8142de-d644-4bd6-aa37-5613b041e0ad	sale.posted	sales_invoice	0fba8446-b96b-44a9-9b73-a038e24d47cc	{"paid": 100.00, "total": 100.00, "customer_id": "c70082c8-535b-4022-8881-f029fbb069b4", "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0054", "payment_method": "cash"}	2026-09-21 21:09:09.726049+00
ea329bd7-c7ef-4b70-a1c2-7489b7a5c463	a9d8394f-8572-40f2-baaf-78e63e4ba571	customer_payment.recorded	customer	4885e843-1ad8-47f7-ad57-57522663543c	{"amount": 10100, "method": "cash", "invoice_id": null, "payment_date": "2026-09-21"}	2026-09-21 21:31:45.183859+00
378644d0-562d-44f6-b403-b14687599d87	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	d5777c1d-cac0-451d-923e-111f0224e3a1	{"paid": 0, "total": 4700.00, "customer_id": "7c110c35-0cd6-45e9-ac38-c8b8295fdde5", "outstanding": 4700.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0055", "payment_method": "credit"}	2026-09-21 23:02:30.506344+00
0cc72c9a-39fd-4049-ad2e-b6776663b0f7	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	949ccda8-4a68-4d24-bd0e-77d6c8e88ab0	{"paid": 0, "total": 1200.00, "customer_id": "7c110c35-0cd6-45e9-ac38-c8b8295fdde5", "outstanding": 1200.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0056", "payment_method": "credit"}	2026-09-21 23:07:15.48219+00
0d1215ef-b00f-4392-9e49-4e8836f6284e	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	c763f24a-fdb5-440a-9297-a76ec90f52dd	{"paid": 0, "total": 200.00, "customer_id": "7c110c35-0cd6-45e9-ac38-c8b8295fdde5", "outstanding": 200.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0057", "payment_method": "credit"}	2026-09-22 11:08:43.096348+00
160ac32e-b375-4a06-a753-e83810a8ec45	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	9daa8e11-32b0-4931-991a-ed9ab7b40f13	{"paid": 50.00, "total": 50.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0058", "payment_method": "cash"}	2026-09-22 12:30:30.890358+00
d4b48d2b-4ec0-4585-b212-c3c0be663fe0	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	5bcfb8a0-057d-491b-9028-6c5155bed1fb	{"paid": 2200.00, "total": 2200.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0059", "payment_method": "cash"}	2026-09-22 13:21:02.798311+00
4b2485be-1fd2-47d7-99c4-e0b03e4856c1	a9d8394f-8572-40f2-baaf-78e63e4ba571	customer_payment.recorded	customer	7c110c35-0cd6-45e9-ac38-c8b8295fdde5	{"amount": 1800, "method": "cash", "invoice_id": null, "payment_date": "2026-09-22"}	2026-09-22 13:22:39.417963+00
b2b2599a-fc2d-4b18-86a2-ebf30821e283	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	84977fd4-01f7-42d8-964b-7f555f2fc53a	{"paid": 1200.00, "total": 1200.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0060", "payment_method": "cash"}	2026-09-22 13:31:38.268963+00
e43716dd-7614-4eab-9664-28fe27212b29	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	651c336c-a3a7-4701-b66c-497a12f68a19	{"paid": 400.00, "total": 400.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0061", "payment_method": "cash"}	2026-09-22 16:52:26.464804+00
57970e7f-d96f-4917-8f1d-ef8697b165de	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	f7135022-c484-4a9f-83c3-6a4012598d7b	{"paid": 1800.00, "total": 1800.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0062", "payment_method": "cash"}	2026-09-22 17:23:50.16267+00
20e238df-2d54-4dae-b77b-025f09371954	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	9f20be45-8c79-42e6-9b35-46168a4711c8	{"paid": 700.00, "total": 700.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0063", "payment_method": "cash"}	2026-09-22 20:49:02.506731+00
b505cf3f-b384-46fa-8a73-8dc9234bbf6c	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	4d947441-fbce-42f3-9b3c-c58b7a9fc0f9	{"paid": 3000.00, "total": 3000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0064", "payment_method": "cash"}	2026-09-22 22:23:58.659196+00
e1f92ff9-c7f1-4717-b3c7-a1af47f2f3e9	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	82208862-b457-4b98-ba00-d1c0957026c0	{"paid": 1500.00, "total": 1500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0065", "payment_method": "cash"}	2026-09-22 22:31:48.238509+00
46c3c6c5-9e07-4cea-8c5d-b21752117ec2	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	a9c8fdbe-6f36-4e1e-86e3-d5451c2040e7	{"paid": 2200.00, "total": 2200.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0066", "payment_method": "cash"}	2026-09-23 15:22:29.761912+00
cda06390-8584-49ba-9c67-46454ac9d85a	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	c03e0411-99c6-42ac-a461-93c77aae785f	{"paid": 12200.00, "total": 12200.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0067", "payment_method": "cash"}	2026-09-23 15:30:36.703641+00
a628741e-8ec4-4423-9505-fb0987309196	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	ad7f0c70-9483-4c37-b432-3833ae527e71	{"paid": 1500.00, "total": 1500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0068", "payment_method": "cash"}	2026-09-23 16:00:10.955721+00
0ae7eb16-76a2-41c0-9442-815bf0f85e9d	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	1561993d-8a53-457c-ac24-818e08715012	{"paid": 3700.00, "total": 3700.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0069", "payment_method": "cash"}	2026-09-23 16:43:40.448395+00
a2488484-2f09-481f-a23d-76d7634c98e8	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	16c8666f-1286-4e7b-bc0f-314732bdfe8d	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0070", "payment_method": "cash"}	2026-09-23 16:48:23.000857+00
4d8678a8-ed2f-4b75-8fa3-8e9fcbd0f37f	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	11956f6d-d1c1-407a-81cd-cb36778b0a43	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0071", "payment_method": "cash"}	2026-09-23 16:49:43.259006+00
26776082-a0af-45b7-94d3-b3e9f0dc06d0	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	5ac65b05-f223-452c-a894-cdb6ae4088b4	{"paid": 2500.00, "total": 2500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0072", "payment_method": "cash"}	2026-09-23 16:50:34.55671+00
d780aaf6-29e6-4f37-936c-4df93ff7bbbf	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	8c604b7b-6e82-47ba-acf5-9a83d23d5048	{"paid": 1300.00, "total": 1300.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0073", "payment_method": "cash"}	2026-09-24 16:32:38.201787+00
4653d252-af08-4da4-9cb1-2f60a7891a0d	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	0fa302ac-710a-474c-8b0b-32564f1a3e07	{"paid": 0, "total": 1000.00, "customer_id": "0c5c78a1-73d4-4c02-922e-619277958134", "outstanding": 1000.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0074", "payment_method": "credit"}	2026-09-24 19:10:11.695998+00
50297c28-d247-4984-87a6-be61911c4502	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	718c0a4c-b156-42e7-8996-794036b8d95d	{"paid": 300.00, "total": 300.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0075", "payment_method": "cash"}	2026-09-24 19:55:06.509355+00
ed787482-4698-49d8-919e-df8ed7e6a335	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	c97c98c9-578f-4776-96be-4b145c297a33	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0076", "payment_method": "cash"}	2026-09-26 11:41:26.534927+00
41e03d70-d777-4f96-a779-03e6dcf3d591	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	904a49bb-a1b4-49cb-bf46-d3400cb02529	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0077", "payment_method": "cash"}	2026-09-26 11:41:45.887686+00
42b1b1a0-d312-4896-bd0a-d4f8b0cfe2e4	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	cfd69f6c-98c1-4090-95ed-664c0c4fccee	{"paid": 1500.00, "total": 1500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0078", "payment_method": "cash"}	2026-09-26 12:36:50.661856+00
75b2913c-fd05-4f57-9b66-e5a051d19c69	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	20bab1ce-e0be-4fdd-8601-dd514803b7c3	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0079", "payment_method": "cash"}	2026-09-26 12:39:09.878951+00
5ece49c7-4619-4008-9ae7-b75a1aa568cf	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	9067bcb6-8f83-431f-8a3f-60421ef09368	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0080", "payment_method": "cash"}	2026-09-26 12:47:13.017117+00
031aa764-6d0a-4ab3-a429-3661ef90914f	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	2cfc3dae-c39e-475a-8309-29cbbc4f4f83	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0081", "payment_method": "cash"}	2026-09-26 13:07:11.820882+00
b031b24b-94c2-4ce8-bfbe-b99daa66ca73	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	73e18190-dcf3-4cc2-9b83-8f7a8135d44b	{"paid": 300.00, "total": 300.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0082", "payment_method": "cash"}	2026-09-26 13:08:59.108622+00
85d531d5-7655-4fc7-8d8f-b0ae7bfc27e6	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	fab81270-7b8d-402f-ad27-924693cb832a	{"paid": 300.00, "total": 300.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0083", "payment_method": "cash"}	2026-09-26 13:09:29.998513+00
6215a567-bf78-424e-98c4-97bdf0c1976d	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	801dfada-018f-4be1-9f20-3e9ffa07c1ca	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0084", "payment_method": "cash"}	2026-09-26 13:18:13.583329+00
d3cf004d-c5b2-4aef-b587-cc8e879e2edc	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	af31a2e9-d36c-4730-92c4-67587988ea00	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0085", "payment_method": "cash"}	2026-09-26 13:26:50.648643+00
da59dde4-7718-4f3f-89c9-b5b92dbd6308	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	191c0e01-612f-4a86-a4f3-0653c833521d	{"paid": 2000.00, "total": 2000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0086", "payment_method": "cash"}	2026-09-26 16:58:00.076874+00
0632b887-e27c-4161-b572-b15db9da023f	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	e22754e2-3fc4-4c1b-958c-e126b2303ceb	{"paid": 2200.00, "total": 2200.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0087", "payment_method": "cash"}	2026-09-26 17:06:44.57585+00
f12e64bb-c85c-441e-a66e-2d844b1206b9	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	ba3b2d6a-eb75-4bf4-b6e4-91ee84502572	{"paid": 2000.00, "total": 2000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0088", "payment_method": "cash"}	2026-09-26 20:07:35.272316+00
d223741a-f263-4568-90c3-88e1ff726721	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	26c73e6e-eb4f-4264-97dd-10112a497ee6	{"paid": 11600.00, "total": 11600.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0089", "payment_method": "cash"}	2026-09-26 20:48:05.879801+00
b07a6414-1dd6-4320-8fb7-dae67c9e0b3b	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	09cbdb00-4ede-4859-94af-ef10a2d109b6	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0090", "payment_method": "cash"}	2026-09-27 09:43:45.756446+00
f4c9aaa0-42cb-43c2-b0a5-c8b01522edf5	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	79b7e6e0-3852-4ddd-b621-066c5e43453c	{"paid": 2000.00, "total": 2000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0091", "payment_method": "cash"}	2026-09-27 14:18:55.646681+00
42f55f34-76b0-4988-a72a-a56ae071753c	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	c63b4728-ffc8-43aa-8a76-107d0ad0937e	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0092", "payment_method": "cash"}	2026-09-27 15:11:58.051624+00
54841bd0-e4b0-4a4f-b102-0ee8719b2625	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	029552cf-ab19-431c-ae9d-e5c462b4372c	{"paid": 2500.00, "total": 2500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0093", "payment_method": "cash"}	2026-09-27 15:33:24.705048+00
5561a199-3957-4dc5-b43a-fcece0309a00	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	318ae0d4-7784-4bfa-bc71-6724175d7777	{"paid": 700.00, "total": 700.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0094", "payment_method": "cash"}	2026-09-27 17:29:06.21963+00
f11c2b0e-3b7c-4766-9e51-45d6286603a1	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	73f4e1c9-1121-487b-a2df-7f65d021182b	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0095", "payment_method": "cash"}	2026-09-27 17:31:03.4268+00
aafa4a20-0c69-4d74-8c6a-bce939991036	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	59ba7786-c59b-4431-afed-5ce6f203e47f	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0096", "payment_method": "cash"}	2026-09-27 17:49:52.193347+00
60047c1b-fbd4-4d3d-8fa3-a5862f5e8106	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	7123ae3c-082f-4341-afd1-ae7529e9287f	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0097", "payment_method": "cash"}	2026-09-27 18:53:42.561866+00
05722bfa-8116-4e02-b909-1dc622e2f471	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	3e10769d-911d-4655-87b9-bd2e2d8513d3	{"paid": 2500.00, "total": 2500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0098", "payment_method": "cash"}	2026-09-27 18:58:28.907346+00
44eeea9d-2c49-47b3-b63c-d8497d9c497f	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	c20a66af-e213-46db-ad3a-b6e05e8b1122	{"paid": 2000.00, "total": 2000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0099", "payment_method": "cash"}	2026-09-27 18:59:48.786358+00
30b7382a-6748-4c5c-8946-116300ec5956	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	0d4944a7-e624-43f3-b18f-2f39c4cde821	{"paid": 1600.00, "total": 1600.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0100", "payment_method": "cash"}	2026-09-27 19:09:41.483656+00
5b78b35b-cdf0-45fc-8133-a0237bdccfc6	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	c2b6e55d-800b-4d16-9d93-3f5607322e6e	{"paid": 800.00, "total": 800.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0101", "payment_method": "cash"}	2026-09-27 19:43:35.851785+00
08400802-947c-4872-a04c-f139e9972961	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	25528fa8-5626-40bd-b4bf-1956bed54498	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0102", "payment_method": "cash"}	2026-09-27 19:44:56.931829+00
8f2bf433-eb74-4b48-b67d-2f1cd808fe0d	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	7ed64f6d-fe92-426f-a703-062fbad58129	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0103", "payment_method": "cash"}	2026-09-27 19:50:00.067983+00
0056f816-390d-4c6f-acc7-88207642365c	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	7673095d-0a09-42be-af97-b4821bb0f9bc	{"paid": 1000.00, "total": 1000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0104", "payment_method": "cash"}	2026-09-27 19:50:15.242696+00
b34e8957-6fb6-46cc-935b-71f214cd7421	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	8a3b47e1-e835-41c8-9fc2-e6220b9b684d	{"paid": 1500.00, "total": 1500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0105", "payment_method": "cash"}	2026-09-27 20:22:58.5971+00
47eedd1e-4eda-45aa-8da5-f91ac835fd44	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	8314365f-2c0e-4bb1-b35c-6013754d0e3c	{"paid": 300.00, "total": 300.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0106", "payment_method": "cash"}	2026-09-27 21:02:30.232727+00
eb912fda-4de7-466f-9335-5837c4340f20	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	fd7d4d6f-1b50-4bb4-9a65-1959f7a8a065	{"paid": 1750.00, "total": 1750.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0107", "payment_method": "cash"}	2026-09-27 22:02:16.37897+00
4bb2b3b8-8aa3-4b57-b83c-9f65a4a10c5c	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	39ce96b4-ec0b-43af-bbc9-ff514e7096d2	{"paid": 1500.00, "total": 1500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0108", "payment_method": "cash"}	2026-09-27 22:26:16.923743+00
3a37140a-a111-4f01-8fa8-a189f91b5f6b	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	13d833bf-addd-431c-8af9-760bb0229f2f	{"paid": 500.00, "total": 500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0109", "payment_method": "cash"}	2026-09-27 22:27:05.850219+00
3ea16d4a-71e6-4ce3-8727-b886c76a8c2b	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	2b28aba0-a869-4942-883c-fc5fbb64fa74	{"paid": 1500.00, "total": 1500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0110", "payment_method": "cash"}	2026-09-27 22:27:28.78832+00
b54f57b4-8495-498c-a720-9748eb0a2860	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	70b03851-5bcb-4462-bba1-201f5ff596f8	{"paid": 5750.00, "total": 5750.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0111", "payment_method": "cash"}	2026-09-28 00:31:17.286378+00
dda66369-6a02-4f82-85ce-ade328c3eb4f	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	75e359bf-4c3a-4b09-9f50-0d3c1181bc5e	{"paid": 2000.00, "total": 2000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0112", "payment_method": "cash"}	2026-09-28 13:12:28.818171+00
e874d2ba-efc0-43dc-a8f1-a26f388ee7d8	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	4c1899ec-0474-46d0-8ae7-efc9b0310ac1	{"paid": 1500.00, "total": 1500.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0113", "payment_method": "cash"}	2026-09-28 13:35:13.392158+00
b7388592-7816-499a-aa70-c2884bf406c3	a9d8394f-8572-40f2-baaf-78e63e4ba571	sale.posted	sales_invoice	ba3878af-0166-4cf5-9621-754aeb74773b	{"paid": 5000.00, "total": 5000.00, "customer_id": null, "outstanding": 0.00, "warehouse_id": "f00a0950-fc40-4801-ab3e-f158fdd9e091", "invoice_number": "INV--202609-0114", "payment_method": "cash"}	2026-09-28 14:56:55.615501+00
\.


--
-- Data for Name: brands; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."brands" ("id", "name", "created_at", "name_ar") FROM stdin;
f752c58a-c54b-44a9-bf11-7b9b9d920cec	JW	2026-09-17 15:05:48.27906+00	جي دبل يو
74871a9d-135c-4554-8d4a-d15ddaf85843	SDM	2026-09-17 15:06:49.323935+00	اس دي ام
a73fcf68-3e04-4de8-83b1-b7cb19211437	كره حراري	2026-09-17 15:11:19.889284+00	كره حراري
439fd0bd-3d2d-4967-b9bd-54261105d6e0	النيزك	2026-09-17 15:12:35.328172+00	النيزك
61b012dd-1fd4-4377-9249-0a0fb48b6ee6	شل	2026-09-17 15:13:35.380157+00	شل
d3e21c96-2599-4408-a931-a05f5f0cd4bb	بترومين	2026-09-17 15:13:50.199052+00	بترومين
f9dee7cf-1165-43cc-a965-9771e88be3a1	السقر	2026-09-17 15:14:04.186229+00	السقر
b6298129-bb3b-4483-ae07-a11a08a3d1ae	OPPLE	2026-09-17 15:18:57.392826+00	اوبل
c0dafee1-57a3-436e-8ccf-ff3c3b70b6ec	H-CENTO	2026-09-17 15:23:15.129464+00	سينتو
d68c5a1b-7ecb-41ca-9532-470b35d5a359	AL WAFA	2026-09-17 15:26:32.281885+00	الوفا
4344c739-fedf-4de6-a9b7-546949c1a69d	ياباني 125	2026-09-18 21:11:42.694247+00	ياباني 125
fbc0f908-9a27-4af9-bd59-f4415b45e302	X100	2026-09-18 21:12:04.482399+00	X100
eb9b4900-709b-49d6-beb7-64279b8883b4	بيماس	2026-09-18 23:54:07.303296+00	بيماس
9ab06b53-a758-492e-81c4-12e1fe1da189	كرتون اغبر	2026-09-19 00:12:41.329172+00	كرتون اغبر
06e012d3-4d3a-412f-a621-37b46f80464e	دوزك	2026-09-19 12:12:44.123599+00	دوزك
7dbfdca7-0d06-49d8-8c63-9e104b5c3bb5	GL	2026-09-19 15:15:06.353458+00	GL
f4b7fa20-26be-403d-9811-f72510ea5de0	ARB	2026-09-19 15:24:07.239862+00	ARB
08c5d8cb-2d49-48d9-b0c0-ffb872ba793b	OPPLE	2026-09-19 15:29:08.532775+00	OPPLE
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."categories" ("id", "name", "name_ar", "parent_id", "created_at") FROM stdin;
67e25cfb-fab6-42e9-9c98-6330601eace9	قطع غيار	قطع غيار خارجيه	\N	2026-09-17 14:58:23.643315+00
f4ab4dbf-afb7-4d93-b8da-05151e672d4c	قطع غيار داخليه مكينه	قطع غيار داخليه مكينه	\N	2026-09-17 15:00:48.144289+00
fbf81d00-6cf7-455f-978d-703e16f8b23d	زينه	زينه	\N	2026-09-17 15:01:53.962854+00
89117623-60c3-4138-8cd7-38a45387b8db	زيوت + سوائل	زيوت + سوائل	\N	2026-09-17 15:02:37.980953+00
e1a61575-7a44-4f6f-8c5f-d50a38d21398	مسامير	مسامير	\N	2026-09-21 14:44:17.65837+00
ff24be09-8a9d-4800-9866-8fa71bc2e589	اسلاك	اسلاك	\N	2026-09-22 19:28:32.942618+00
\.


--
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."company_settings" ("id", "name", "legal_name", "tax_number", "currency", "currency_symbol", "tax_rate", "logo_url", "address", "phone", "email", "invoice_prefix", "barcode_enabled", "updated_at", "enforce_customer_credit_limit", "catalog_modules") FROM stdin;
1	محل العدادات وقطع الغيار والزينة	\N	\N	YER	ر.ي	0.000	\N	\N	\N	\N	INV-	t	2026-09-11 21:24:45.648775+00	f	{"profile": "spare_parts", "enableUnits": true, "enableBrands": true, "enableOrigins": true, "enableQualityGrades": true, "enableMakesAndModels": true}
\.


--
-- Data for Name: countries_of_origin; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."countries_of_origin" ("id", "code", "name", "name_ar") FROM stdin;
31bac128-782c-4976-afde-61475ec6c6d8	JP	Japan	اليابان
a9c087b4-2192-4217-9fa8-ca823a7172d0	CN	China	الصين
a52a0b0d-ae4c-4e01-b27e-529c211ab154	TH	Thailand	تايلند
fc3d6af1-1581-4326-ad38-866d8ac40580	TW	Taiwan	تايوان
aafb9f75-97fa-468f-a488-19c8ecaa2003	IN	India	الهند
30f730c7-d4b4-4704-aceb-1ff3fef53f4c	ID	Indonesia	إندونيسيا
bf31a286-4059-4846-a4ee-c07dc868c24a	KR	South Korea	كوريا الجنوبية
778bbb40-236a-4b27-96b0-e507730ebb4e	AE	United Arab Emirates	الإمارات
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."customers" ("id", "name", "phone", "email", "address", "credit_limit", "balance", "is_active", "created_at", "updated_at", "loyalty_points") FROM stdin;
7c110c35-0cd6-45e9-ac38-c8b8295fdde5	محمد	\N	\N	\N	10000.00	6500.00	t	2026-09-20 18:45:06.662922+00	2026-09-22 13:22:39.417963+00	0
0c5c78a1-73d4-4c02-922e-619277958134	عبود الرعوي	\N	\N	\N	1000.00	1000.00	t	2026-09-24 19:08:18.862998+00	2026-09-24 19:10:11.695998+00	0
0846714f-45d7-40e4-9a15-1cae5e0fea09	نجم	\N	\N	\N	35000.00	32275.00	t	2026-09-20 20:33:20.132824+00	2026-09-20 23:51:13.729458+00	0
c70082c8-535b-4022-8881-f029fbb069b4	راشد	\N	\N	\N	10000.00	1750.00	t	2026-09-21 00:07:47.930647+00	2026-09-21 00:10:54.669446+00	0
df9ec243-8687-41f0-a0c0-2cba9861334d	عميل مكينه	\N	\N	\N	20000.00	0.00	t	2026-09-21 00:45:45.247517+00	2026-09-21 00:47:03.523738+00	0
\.


--
-- Data for Name: customer_ledger; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."customer_ledger" ("id", "customer_id", "entry_type", "debit", "credit", "reference_id", "reference_type", "occurred_at", "created_by", "note", "source_key") FROM stdin;
0c1bdb10-e3d7-4cb5-819d-e077443c581d	7c110c35-0cd6-45e9-ac38-c8b8295fdde5	sale	4700.00	0.00	d5777c1d-cac0-451d-923e-111f0224e3a1	sales_invoice	2026-09-21 23:02:30.506344+00	a9d8394f-8572-40f2-baaf-78e63e4ba571	إصلاح دفتر العميل — استكمال قيد بيع الفاتورة	repair:sale-delta:d5777c1d-cac0-451d-923e-111f0224e3a1
b196b687-dfd9-4461-b0c2-b03e48f36458	7c110c35-0cd6-45e9-ac38-c8b8295fdde5	sale	1200.00	0.00	949ccda8-4a68-4d24-bd0e-77d6c8e88ab0	sales_invoice	2026-09-21 23:07:15.48219+00	a9d8394f-8572-40f2-baaf-78e63e4ba571	إصلاح دفتر العميل — استكمال قيد بيع الفاتورة	repair:sale-delta:949ccda8-4a68-4d24-bd0e-77d6c8e88ab0
7e2f7377-218b-4afc-b86f-6972d920dd21	0846714f-45d7-40e4-9a15-1cae5e0fea09	sale	32275.00	0.00	3944e543-a181-43e9-b349-52f2cd909e31	sales_invoice	2026-09-20 23:51:13.729458+00	a9d8394f-8572-40f2-baaf-78e63e4ba571	إصلاح دفتر العميل — استكمال قيد بيع الفاتورة	repair:sale-delta:3944e543-a181-43e9-b349-52f2cd909e31
897ca3c8-a296-4826-b836-5156fd4c584e	7c110c35-0cd6-45e9-ac38-c8b8295fdde5	sale	200.00	0.00	c763f24a-fdb5-440a-9297-a76ec90f52dd	sales_invoice	2026-09-22 11:08:43.096348+00	a9d8394f-8572-40f2-baaf-78e63e4ba571	إصلاح دفتر العميل — استكمال قيد بيع الفاتورة	repair:sale-delta:c763f24a-fdb5-440a-9297-a76ec90f52dd
37a6cdbe-01dd-4d7c-89a4-ebf7f374d621	c70082c8-535b-4022-8881-f029fbb069b4	sale	1750.00	0.00	3e4c3f63-1044-4314-8d0d-c68ed208d698	sales_invoice	2026-09-21 00:10:54.669446+00	a9d8394f-8572-40f2-baaf-78e63e4ba571	إصلاح دفتر العميل — استكمال قيد بيع الفاتورة	repair:sale-delta:3e4c3f63-1044-4314-8d0d-c68ed208d698
d3ca413f-5d06-4448-b430-af9bfbd5757e	7c110c35-0cd6-45e9-ac38-c8b8295fdde5	sale	2200.00	0.00	86f93f21-f27a-4b22-bfde-54d5ef19089e	sales_invoice	2026-09-20 19:34:33.752097+00	a9d8394f-8572-40f2-baaf-78e63e4ba571	إصلاح دفتر العميل — استكمال قيد بيع الفاتورة	repair:sale-delta:86f93f21-f27a-4b22-bfde-54d5ef19089e
c0889778-0c75-43d5-ae2e-5b2d04c643d5	7c110c35-0cd6-45e9-ac38-c8b8295fdde5	payment	0.00	1800.00	16d52dbe-51bb-4dc2-8e3a-ed9372bf6ceb	customer_payment	2026-09-22 00:00:00+00	a9d8394f-8572-40f2-baaf-78e63e4ba571	إصلاح دفتر العميل — دفعة سابقة	repair:payment:16d52dbe-51bb-4dc2-8e3a-ed9372bf6ceb
f100455e-cd55-4494-804d-d309ab617f25	0c5c78a1-73d4-4c02-922e-619277958134	sale	1000.00	0.00	0fa302ac-710a-474c-8b0b-32564f1a3e07	sales_invoice	2026-09-24 19:10:11.695998+00	a9d8394f-8572-40f2-baaf-78e63e4ba571	قيد بيع آجل	sale:0fa302ac-710a-474c-8b0b-32564f1a3e07
\.


--
-- Data for Name: warehouses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."warehouses" ("id", "name", "code", "address", "is_default", "is_active", "created_at", "updated_at", "name_ar") FROM stdin;
f00a0950-fc40-4801-ab3e-f158fdd9e091	الرئيسي	\N	\N	t	t	2026-09-18 20:32:09.009416+00	2026-09-18 20:32:09.009416+00	الرئيسي
\.


--
-- Data for Name: sales_invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."sales_invoices" ("id", "invoice_number", "customer_id", "warehouse_id", "status", "subtotal", "discount", "tax", "total", "paid", "payment_method", "note", "created_by", "created_at", "updated_at") FROM stdin;
fd925239-b9a9-49a3-a794-9970ca9036a7	INV--202609-0044	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	12000.00	0.00	0.00	12000.00	12000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 01:02:23.42689+00	2026-09-21 01:02:23.42689+00
f87b66b8-9a03-4269-8377-02f9df4ea05b	INV--202609-0029	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1200.00	200.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-19 13:28:55.094964+00	2026-09-19 13:28:55.094964+00
97b0c3d9-5abb-4887-96de-723d651c0436	INV--202609-0045	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	3000.00	0.00	0.00	3000.00	3000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:16:50.416594+00	2026-09-21 14:16:50.416594+00
d5777c1d-cac0-451d-923e-111f0224e3a1	INV--202609-0055	7c110c35-0cd6-45e9-ac38-c8b8295fdde5	f00a0950-fc40-4801-ab3e-f158fdd9e091	unpaid	4700.00	0.00	0.00	4700.00	0.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 23:02:30.506344+00	2026-09-21 23:02:30.506344+00
3666e67a-f47b-404c-a6c4-54306a1be3f9	INV--202609-0030	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-19 13:29:44.280304+00	2026-09-19 13:29:44.280304+00
775efdc9-3492-4e7c-bf20-ca8cb4559a01	INV--202609-0031	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	3700.00	0.00	0.00	3700.00	3700.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:53:48.521228+00	2026-09-20 16:53:48.521228+00
8c8e674d-b7b5-4b5f-bb7d-650d91a45378	INV--202609-0032	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1500.00	500.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 17:06:11.582872+00	2026-09-20 17:06:11.582872+00
92c9ef18-e371-4ec6-ae41-ad67e38a87aa	INV--202609-0034	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	300.00	0.00	200.00	200.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 18:27:09.565503+00	2026-09-20 18:27:09.565503+00
9174dd78-2d30-43eb-9142-c9769f9358ad	INV--202609-0035	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2200.00	0.00	0.00	2200.00	2200.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 18:44:33.528892+00	2026-09-20 18:44:33.528892+00
89caff9a-1d37-47bf-b020-1e61ad6dcf49	INV--202609-0036	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2000.00	0.00	0.00	2000.00	2000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:18:38.189463+00	2026-09-20 19:18:38.189463+00
949ccda8-4a68-4d24-bd0e-77d6c8e88ab0	INV--202609-0056	7c110c35-0cd6-45e9-ac38-c8b8295fdde5	f00a0950-fc40-4801-ab3e-f158fdd9e091	unpaid	1200.00	0.00	0.00	1200.00	0.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 23:07:15.48219+00	2026-09-21 23:07:15.48219+00
148695ef-ff2b-49fc-848e-542cf947a9cc	INV--202609-0049	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	11600.00	200.00	0.00	11400.00	11400.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:15:50.836514+00	2026-09-21 18:15:50.836514+00
ccc02089-567e-4d2f-ab10-332437446517	INV--202609-0050	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:19:50.649521+00	2026-09-21 18:19:50.649521+00
7af64206-af9b-485f-a3e6-97a877675f24	INV--202609-0051	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1800.00	0.00	0.00	1800.00	1800.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:20:48.734009+00	2026-09-21 18:20:48.734009+00
4d947441-fbce-42f3-9b3c-c58b7a9fc0f9	INV--202609-0064	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	3000.00	0.00	0.00	3000.00	3000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:23:58.659196+00	2026-09-22 22:23:58.659196+00
58dad026-29bf-4006-97c9-b63649a2000d	INV--202609-0039	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 20:32:05.47657+00	2026-09-20 20:32:05.47657+00
3944e543-a181-43e9-b349-52f2cd909e31	INV--202609-0040	0846714f-45d7-40e4-9a15-1cae5e0fea09	f00a0950-fc40-4801-ab3e-f158fdd9e091	unpaid	32275.00	0.00	0.00	32275.00	0.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:51:13.729458+00	2026-09-20 23:51:13.729458+00
b5255f7e-8776-46f4-ac39-f9bc64465517	INV--202609-0033	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2200.00	0.00	0.00	2200.00	2200.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 17:18:56.842415+00	2026-09-20 23:56:01.627752+00
c763f24a-fdb5-440a-9297-a76ec90f52dd	INV--202609-0057	7c110c35-0cd6-45e9-ac38-c8b8295fdde5	f00a0950-fc40-4801-ab3e-f158fdd9e091	unpaid	200.00	0.00	0.00	200.00	0.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 11:08:43.096348+00	2026-09-22 11:08:43.096348+00
3e4c3f63-1044-4314-8d0d-c68ed208d698	INV--202609-0042	c70082c8-535b-4022-8881-f029fbb069b4	f00a0950-fc40-4801-ab3e-f158fdd9e091	unpaid	1750.00	0.00	0.00	1750.00	0.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:10:54.669446+00	2026-09-21 00:10:54.669446+00
9a2793db-9c35-49ac-b135-cf96c85f7362	INV--202609-0043	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:43:07.255057+00	2026-09-21 00:43:07.255057+00
50d9f6fa-dbc2-47a4-b478-4a56d6f12218	INV--202609-0052	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:24:43.957763+00	2026-09-21 18:24:43.957763+00
a2def70e-e60f-47e0-b452-e2d91e282bac	INV--202609-0053	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	750.00	0.00	0.00	750.00	750.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:29:04.416622+00	2026-09-21 18:29:04.416622+00
0fba8446-b96b-44a9-9b73-a038e24d47cc	INV--202609-0054	c70082c8-535b-4022-8881-f029fbb069b4	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	100.00	0.00	0.00	100.00	100.00	cash	\N	ef8142de-d644-4bd6-aa37-5613b041e0ad	2026-09-21 21:09:09.726049+00	2026-09-21 21:09:09.726049+00
9daa8e11-32b0-4931-991a-ed9ab7b40f13	INV--202609-0058	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	50.00	0.00	0.00	50.00	50.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 12:30:30.890358+00	2026-09-22 12:30:30.890358+00
5bcfb8a0-057d-491b-9028-6c5155bed1fb	INV--202609-0059	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2200.00	0.00	0.00	2200.00	2200.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 13:21:02.798311+00	2026-09-22 13:21:02.798311+00
86f93f21-f27a-4b22-bfde-54d5ef19089e	INV--202609-0038	7c110c35-0cd6-45e9-ac38-c8b8295fdde5	f00a0950-fc40-4801-ab3e-f158fdd9e091	partial	2200.00	0.00	0.00	2200.00	1800.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:34:33.752097+00	2026-09-22 13:22:39.417963+00
16f1737d-9897-4dd7-aaa2-d65036946600	INV--202609-0037	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2600.00	0.00	0.00	2600.00	2600.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:33:35.251356+00	2026-09-21 21:32:17.229726+00
83007bfb-ab57-474f-abcc-2d7a9e6127a1	INV--202609-0041	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:05:11.785194+00	2026-09-21 21:32:17.229726+00
6450f56e-fed2-4574-9099-912d55b30f02	INV--202609-0046	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:26:15.55552+00	2026-09-21 21:32:17.229726+00
6aa9a0dd-0a22-468f-b711-980ad6c85d26	INV--202609-0047	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2400.00	0.00	0.00	2400.00	2400.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:27:58.390452+00	2026-09-21 21:32:17.229726+00
119f43b8-2150-4449-b525-b25e126e8519	INV--202609-0048	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	3100.00	0.00	0.00	3100.00	3100.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:49:25.837455+00	2026-09-21 21:32:17.229726+00
84977fd4-01f7-42d8-964b-7f555f2fc53a	INV--202609-0060	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1200.00	0.00	0.00	1200.00	1200.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 13:31:38.268963+00	2026-09-22 13:31:38.268963+00
651c336c-a3a7-4701-b66c-497a12f68a19	INV--202609-0061	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	400.00	0.00	0.00	400.00	400.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 16:52:26.464804+00	2026-09-22 16:52:26.464804+00
f7135022-c484-4a9f-83c3-6a4012598d7b	INV--202609-0062	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2000.00	200.00	0.00	1800.00	1800.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 17:23:50.16267+00	2026-09-22 17:23:50.16267+00
9f20be45-8c79-42e6-9b35-46168a4711c8	INV--202609-0063	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	700.00	0.00	0.00	700.00	700.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 20:49:02.506731+00	2026-09-22 20:49:02.506731+00
82208862-b457-4b98-ba00-d1c0957026c0	INV--202609-0065	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1500.00	0.00	0.00	1500.00	1500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:31:48.238509+00	2026-09-22 22:31:48.238509+00
a9c8fdbe-6f36-4e1e-86e3-d5451c2040e7	INV--202609-0066	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2200.00	0.00	0.00	2200.00	2200.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 15:22:29.761912+00	2026-09-23 15:22:29.761912+00
c03e0411-99c6-42ac-a461-93c77aae785f	INV--202609-0067	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	18200.00	0.00	0.00	18200.00	18200.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 15:30:36.703641+00	2026-09-23 15:30:36.703641+00
ad7f0c70-9483-4c37-b432-3833ae527e71	INV--202609-0068	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1700.00	0.00	0.00	1700.00	1700.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:00:10.955721+00	2026-09-23 16:00:10.955721+00
1561993d-8a53-457c-ac24-818e08715012	INV--202609-0069	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	3700.00	0.00	0.00	3700.00	3700.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:43:40.448395+00	2026-09-23 16:43:40.448395+00
16c8666f-1286-4e7b-bc0f-314732bdfe8d	INV--202609-0070	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:48:23.000857+00	2026-09-23 16:48:23.000857+00
11956f6d-d1c1-407a-81cd-cb36778b0a43	INV--202609-0071	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:49:43.259006+00	2026-09-23 16:49:43.259006+00
5ac65b05-f223-452c-a894-cdb6ae4088b4	INV--202609-0072	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2500.00	0.00	0.00	2500.00	2500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:50:34.55671+00	2026-09-23 16:50:34.55671+00
8c604b7b-6e82-47ba-acf5-9a83d23d5048	INV--202609-0073	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1500.00	200.00	0.00	1300.00	1300.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 16:32:38.201787+00	2026-09-24 16:32:38.201787+00
0fa302ac-710a-474c-8b0b-32564f1a3e07	INV--202609-0074	0c5c78a1-73d4-4c02-922e-619277958134	f00a0950-fc40-4801-ab3e-f158fdd9e091	unpaid	1000.00	0.00	0.00	1000.00	0.00	credit	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 19:10:11.695998+00	2026-09-24 19:10:11.695998+00
718c0a4c-b156-42e7-8996-794036b8d95d	INV--202609-0075	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	200.00	0.00	300.00	300.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 19:55:06.509355+00	2026-09-24 19:55:06.509355+00
c97c98c9-578f-4776-96be-4b145c297a33	INV--202609-0076	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 11:41:26.534927+00	2026-09-26 11:41:26.534927+00
904a49bb-a1b4-49cb-bf46-d3400cb02529	INV--202609-0077	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 11:41:45.887686+00	2026-09-26 11:41:45.887686+00
cfd69f6c-98c1-4090-95ed-664c0c4fccee	INV--202609-0078	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1500.00	0.00	0.00	1500.00	1500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 12:36:50.661856+00	2026-09-26 12:36:50.661856+00
20bab1ce-e0be-4fdd-8601-dd514803b7c3	INV--202609-0079	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 12:39:09.878951+00	2026-09-26 12:39:09.878951+00
9067bcb6-8f83-431f-8a3f-60421ef09368	INV--202609-0080	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 12:47:13.017117+00	2026-09-26 12:47:13.017117+00
2cfc3dae-c39e-475a-8309-29cbbc4f4f83	INV--202609-0081	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 13:07:11.820882+00	2026-09-26 13:07:11.820882+00
73e18190-dcf3-4cc2-9b83-8f7a8135d44b	INV--202609-0082	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	300.00	0.00	0.00	300.00	300.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 13:08:59.108622+00	2026-09-26 13:08:59.108622+00
fab81270-7b8d-402f-ad27-924693cb832a	INV--202609-0083	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	300.00	0.00	0.00	300.00	300.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 13:09:29.998513+00	2026-09-26 13:09:29.998513+00
801dfada-018f-4be1-9f20-3e9ffa07c1ca	INV--202609-0084	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 13:18:13.583329+00	2026-09-26 13:18:13.583329+00
af31a2e9-d36c-4730-92c4-67587988ea00	INV--202609-0085	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 13:26:50.648643+00	2026-09-26 13:26:50.648643+00
191c0e01-612f-4a86-a4f3-0653c833521d	INV--202609-0086	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2000.00	0.00	0.00	2000.00	2000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 16:58:00.076874+00	2026-09-26 16:58:00.076874+00
e22754e2-3fc4-4c1b-958c-e126b2303ceb	INV--202609-0087	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2200.00	0.00	0.00	2200.00	2200.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 17:06:44.57585+00	2026-09-26 17:06:44.57585+00
ba3b2d6a-eb75-4bf4-b6e4-91ee84502572	INV--202609-0088	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2000.00	0.00	0.00	2000.00	2000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 20:07:35.272316+00	2026-09-26 20:07:35.272316+00
26c73e6e-eb4f-4264-97dd-10112a497ee6	INV--202609-0089	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	11600.00	0.00	0.00	11600.00	11600.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 20:48:05.879801+00	2026-09-26 20:48:05.879801+00
09cbdb00-4ede-4859-94af-ef10a2d109b6	INV--202609-0090	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 09:43:45.756446+00	2026-09-27 09:43:45.756446+00
79b7e6e0-3852-4ddd-b621-066c5e43453c	INV--202609-0091	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2000.00	0.00	0.00	2000.00	2000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 14:18:55.646681+00	2026-09-27 14:18:55.646681+00
c63b4728-ffc8-43aa-8a76-107d0ad0937e	INV--202609-0092	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 15:11:58.051624+00	2026-09-27 15:11:58.051624+00
029552cf-ab19-431c-ae9d-e5c462b4372c	INV--202609-0093	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2700.00	200.00	0.00	2500.00	2500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 15:33:24.705048+00	2026-09-27 15:33:24.705048+00
318ae0d4-7784-4bfa-bc71-6724175d7777	INV--202609-0094	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	750.00	50.00	0.00	700.00	700.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:29:06.21963+00	2026-09-27 17:29:06.21963+00
73f4e1c9-1121-487b-a2df-7f65d021182b	INV--202609-0095	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:31:03.4268+00	2026-09-27 17:31:03.4268+00
59ba7786-c59b-4431-afed-5ce6f203e47f	INV--202609-0096	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:49:52.193347+00	2026-09-27 17:49:52.193347+00
7123ae3c-082f-4341-afd1-ae7529e9287f	INV--202609-0097	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 18:53:42.561866+00	2026-09-27 18:53:42.561866+00
3e10769d-911d-4655-87b9-bd2e2d8513d3	INV--202609-0098	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2500.00	0.00	0.00	2500.00	2500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 18:58:28.907346+00	2026-09-27 18:58:28.907346+00
c20a66af-e213-46db-ad3a-b6e05e8b1122	INV--202609-0099	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2000.00	0.00	0.00	2000.00	2000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 18:59:48.786358+00	2026-09-27 18:59:48.786358+00
0d4944a7-e624-43f3-b18f-2f39c4cde821	INV--202609-0100	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1600.00	0.00	0.00	1600.00	1600.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 19:09:41.483656+00	2026-09-27 19:09:41.483656+00
c2b6e55d-800b-4d16-9d93-3f5607322e6e	INV--202609-0101	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	200.00	0.00	800.00	800.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 19:43:35.851785+00	2026-09-27 19:43:35.851785+00
25528fa8-5626-40bd-b4bf-1956bed54498	INV--202609-0102	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 19:44:56.931829+00	2026-09-27 19:44:56.931829+00
7ed64f6d-fe92-426f-a703-062fbad58129	INV--202609-0103	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-18 19:50:00.067983+00	2026-09-27 19:50:00.067983+00
7673095d-0a09-42be-af97-b4821bb0f9bc	INV--202609-0104	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1000.00	0.00	0.00	1000.00	1000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-13 19:50:15.242696+00	2026-09-27 19:50:15.242696+00
8a3b47e1-e835-41c8-9fc2-e6220b9b684d	INV--202609-0105	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1500.00	0.00	0.00	1500.00	1500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 20:22:58.5971+00	2026-09-27 20:22:58.5971+00
8314365f-2c0e-4bb1-b35c-6013754d0e3c	INV--202609-0106	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	200.00	0.00	300.00	300.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 21:02:30.232727+00	2026-09-27 21:02:30.232727+00
fd7d4d6f-1b50-4bb4-9a65-1959f7a8a065	INV--202609-0107	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1750.00	0.00	0.00	1750.00	1750.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 22:02:16.37897+00	2026-09-27 22:02:16.37897+00
39ce96b4-ec0b-43af-bbc9-ff514e7096d2	INV--202609-0108	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1500.00	0.00	0.00	1500.00	1500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 22:26:16.923743+00	2026-09-27 22:26:16.923743+00
13d833bf-addd-431c-8af9-760bb0229f2f	INV--202609-0109	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	500.00	0.00	0.00	500.00	500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 22:27:05.850219+00	2026-09-27 22:27:05.850219+00
2b28aba0-a869-4942-883c-fc5fbb64fa74	INV--202609-0110	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1500.00	0.00	0.00	1500.00	1500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 22:27:28.78832+00	2026-09-27 22:27:28.78832+00
70b03851-5bcb-4462-bba1-201f5ff596f8	INV--202609-0111	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	5750.00	0.00	0.00	5750.00	5750.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 00:31:17.286378+00	2026-09-28 00:31:17.286378+00
75e359bf-4c3a-4b09-9f50-0d3c1181bc5e	INV--202609-0112	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	2000.00	0.00	0.00	2000.00	2000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 13:12:28.818171+00	2026-09-28 13:12:28.818171+00
4c1899ec-0474-46d0-8ae7-efc9b0310ac1	INV--202609-0113	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	1500.00	0.00	0.00	1500.00	1500.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 13:35:13.392158+00	2026-09-28 13:35:13.392158+00
ba3878af-0166-4cf5-9621-754aeb74773b	INV--202609-0114	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	5000.00	0.00	0.00	5000.00	5000.00	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 14:56:55.615501+00	2026-09-28 14:56:55.615501+00
\.


--
-- Data for Name: customer_payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."customer_payments" ("id", "customer_id", "invoice_id", "amount", "payment_method", "payment_date", "note", "created_by", "created_at", "updated_at") FROM stdin;
16d52dbe-51bb-4dc2-8e3a-ed9372bf6ceb	7c110c35-0cd6-45e9-ac38-c8b8295fdde5	86f93f21-f27a-4b22-bfde-54d5ef19089e	1800.00	cash	2026-09-22	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 13:22:39.417963+00	2026-09-22 13:22:39.417963+00
\.


--
-- Data for Name: expense_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."expense_categories" ("id", "name", "name_ar", "created_at") FROM stdin;
\.


--
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."expenses" ("id", "category_id", "amount", "payment_method", "expense_date", "note", "created_by", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: quality_grades; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."quality_grades" ("id", "code", "name", "name_ar", "sort_order") FROM stdin;
927b49ac-f186-42a5-8612-c3fa3f2958b7	genuine	Genuine / OEM	أصلي / وكالة	1
a3ae5599-bae3-4744-9037-653d1e315355	premium	Premium aftermarket	بديل ممتاز	2
6a730d0f-f6b7-4694-83d7-cc37b6ed7f6e	standard	Standard aftermarket	تجاري درجة أولى	3
4b169602-ab92-4f8f-9386-5532bce3de4a	economy	Economy	اقتصادي	4
\.


--
-- Data for Name: units; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."units" ("id", "name", "short_name", "created_at", "name_ar") FROM stdin;
cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	طقم	unit	2026-09-17 15:27:10.209752+00	طقم
493a3111-fed7-4f09-91cb-8388aa4f9e64	حبه	unit	2026-09-17 15:27:22.09851+00	حبه
3bb255df-3c02-4951-b537-cce8881e3004	علبه لتر	unit	2026-09-17 15:27:49.000112+00	علبه لتر
e210d5bc-2610-4fed-a495-abb34801e7f9	متر	unit	2026-09-17 15:28:06.434229+00	متر
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."products" ("id", "sku", "barcode", "name", "name_ar", "description", "image_url", "category_id", "brand_id", "unit_id", "cost_price", "sale_price", "tax_rate", "min_stock", "track_expiry", "is_active", "created_at", "updated_at", "shelf_location", "is_service", "origin_id", "quality_grade_id") FROM stdin;
4b6069f7-bbc0-4581-9929-16a0b8bb1cb6	\N	\N	فخذ ياباني وكاله أبو باكت اغبر	فخذ ياباني وكاله أبو باكت اغبر	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:57:51.616347+00	2026-09-18 23:57:51.616347+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
010b68a8-6009-4b64-aa3f-81c7ec49712f	\N	\N	جير سلف ياباني 125	جير سلف ياباني 125	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:56:49.011257+00	2026-09-18 23:58:09.906216+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
2d23f736-104e-46fe-ba9c-bddbb8e5793f	\N	\N	معبا ياباني وكاله أبو باكت اغبر	معبا ياباني وكاله أبو باكت اغبر	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:55:37.897765+00	2026-09-18 23:58:23.235476+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
8ada3a8c-b065-4c68-996d-c2acba847031	\N	\N	معبا ياباني جي دبل يو 125	معبا ياباني جي دبل يو 125	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:00:03.84076+00	2026-09-19 00:00:03.84076+00	\N	f	\N	\N
9941b3da-cdd7-467e-b67b-e5d36eca3a50	\N	\N	معبا صيني اس دي ام 150	معبا صيني اس دي ام 150	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:00:52.324724+00	2026-09-19 00:00:52.324724+00	\N	f	\N	\N
85ea67c7-48d4-41c4-8b22-9f847dd0f311	\N	\N	JW	طقم جيرات وسنسله جي دبليو	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	4800.00	5000.00	0.000	1.000	f	t	2026-09-18 20:14:47.420109+00	2026-09-18 23:34:00.307265+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
2f8aa636-2fd9-4203-9f07-119e7bc00292	\N	\N	فخذ X100 أبو باكت اغبر	فخذ X100 أبو باكت اغبر	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:01:46.140996+00	2026-09-19 00:01:46.140996+00	\N	f	\N	\N
f13b95f2-c4c9-4134-91b1-c80df000a226	\N	\N	اجهزه اس دي ام 150صيني	جهاز SDM  150  صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:41:13.07834+00	2026-09-20 15:33:44.16424+00	\N	f	\N	\N
c7ceaa29-99c5-4064-8f5b-a2ef480ff9c3	\N	\N	طقم جيرات وسنسله تمساح X100	طقم جيرات وسنسله تمساح X100	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:37:09.242293+00	2026-09-18 23:37:09.242293+00	\N	f	\N	\N
4265d2e3-d5c7-409b-8b02-2f24fb33e9fd	\N	\N	طقم جيرات وسنسله أبو ختم	طقم جيرات وسنسله أبو ختم	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:38:38.970993+00	2026-09-18 23:38:38.970993+00	\N	f	\N	\N
973e483c-4297-4bdf-b4de-eb08fa04b5e0	\N	\N	جهاز جي دبل يو 150 صيني	جهاز جي دبل يو 150 صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:40:08.305072+00	2026-09-18 23:40:08.305072+00	\N	f	\N	\N
e4e83290-3491-489e-8c81-5a4e0e8cce21	\N	\N	جهاز كره حراري 200 صيني	جهاز كره حراري 200 صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	a73fcf68-3e04-4de8-83b1-b7cb19211437	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:42:01.185476+00	2026-09-18 23:42:01.185476+00	\N	f	\N	\N
00061a71-6aa0-4498-89a8-6ddce3edf098	\N	\N	جهاز ياباني 125	جهاز ياباني 125	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	4900.00	5000.00	0.000	1.000	f	t	2026-09-18 23:53:12.45932+00	2026-09-20 15:40:13.217668+00	\N	f	\N	\N
fe6f7096-f14d-450d-a17f-5fdcc77b27e4	\N	\N	طقم جيرات وسنسله اس دي ام	طقم جيرات وسنسله اس دي ام	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	4450.00	4500.00	0.000	1.000	f	t	2026-09-18 23:45:10.995869+00	2026-09-18 23:45:10.995869+00	\N	f	\N	\N
8496eb74-7492-43e9-bb4c-6113510f6c70	\N	\N	جهاز جي دبل يو200 صيني	جهاز جي دبل يو200 صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:46:26.296043+00	2026-09-18 23:46:26.296043+00	\N	f	\N	\N
df95b4b1-969d-42c3-88cd-acc98cfc5d9e	\N	\N	جهاز عربه جي دبل يو	جهاز عربه جي دبل يو	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:47:16.685223+00	2026-09-18 23:47:16.685223+00	\N	f	\N	\N
3f0e3cf3-985e-40a7-a1c7-8b6a03f98a5b	\N	\N	جهاز200 صيني	جهاز200 صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:48:15.729737+00	2026-09-18 23:48:15.729737+00	\N	f	\N	\N
67b4d51d-7a1c-4716-88e8-b7b1e4afa0b0	\N	\N	كويل جي دبل يو 150	كويل جي دبل يو 150	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:49:02.708962+00	2026-09-18 23:49:02.708962+00	\N	f	\N	\N
2978f16a-7cca-486a-b90c-1db169fdfe84	\N	\N	كويل 150	كويل 150	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:49:45.16623+00	2026-09-18 23:49:45.16623+00	\N	f	\N	\N
e9abeb2d-9c73-446b-952e-f84be65996bc	\N	\N	كويل ياباني 125	كويل ياباني 125	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:51:20.9236+00	2026-09-18 23:51:20.9236+00	\N	f	\N	\N
84841448-1831-4b7b-b014-4ee11c4beb65	\N	\N	معبا بيماس ياباني 125 باكت احمر	معبا بيماس ياباني 125 باكت احمر	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	eb9b4900-709b-49d6-beb7-64279b8883b4	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-18 23:54:50.983647+00	2026-09-18 23:54:50.983647+00	\N	f	\N	\N
735b1adc-f1b9-4cfe-88e0-687837be52de	\N	\N	والات كره حراري 250	والات كره حراري 250	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	a73fcf68-3e04-4de8-83b1-b7cb19211437	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:09:04.097741+00	2026-09-19 00:09:04.097741+00	\N	f	\N	\N
786c7231-bbb4-432b-b880-342b5155910d	\N	\N	والات صيني جي دبل يو 150	والات صيني جي دبل يو 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:02:46.779358+00	2026-09-19 00:02:46.779358+00	\N	f	\N	\N
3a629d05-1105-4a83-b05e-24ffe4ccbe3a	\N	\N	والات صيني جي دبل يو 200	والات صيني جي دبل يو 200	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:03:57.947638+00	2026-09-19 00:03:57.947638+00	\N	f	\N	\N
6fbc36ce-5cc3-4426-8ad2-86252fb6d9b2	\N	\N	والات اس دي ام 200	والات اس دي ام 200	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	74871a9d-135c-4554-8d4a-d15ddaf85843	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:05:22.389754+00	2026-09-19 00:05:22.389754+00	\N	f	\N	\N
0f56c981-2221-4a75-b0f6-4edb695cc692	\N	\N	والات اس دي ام 150	والات اس دي ام 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	74871a9d-135c-4554-8d4a-d15ddaf85843	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:06:16.219408+00	2026-09-19 00:06:16.219408+00	\N	f	\N	\N
b7ec0217-fc66-457d-8191-3b42dee97228	\N	\N	والات كره حراري 46-200	والات كره حراري 46-200	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	a73fcf68-3e04-4de8-83b1-b7cb19211437	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:07:08.939062+00	2026-09-19 00:07:08.939062+00	\N	f	\N	\N
b2cca38b-26b4-447b-aadc-fc6da008fa9e	\N	\N	والات كره حراري 150	والات كره حراري 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	a73fcf68-3e04-4de8-83b1-b7cb19211437	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:08:22.651773+00	2026-09-19 00:08:22.651773+00	\N	f	\N	\N
ca4c7e27-a502-431d-87cb-ed024e1f426a	\N	\N	جير الثالث صيني جي دبل يو 150	جير الثالث صيني جي دبل يو 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:09:42.53665+00	2026-09-19 00:09:42.53665+00	\N	f	\N	\N
11879208-dd23-4aa6-8e79-d1d9fafecd41	\N	\N	جير الثالث صيني جي دبل يو 200	جير الثالث صيني جي دبل يو 200	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:10:25.483793+00	2026-09-19 00:10:25.483793+00	\N	f	\N	\N
532dddc9-e7b6-4372-afa0-776c3b683956	\N	\N	جير الثالث صيني أبو قرطاس 200	جير الثالث صيني أبو قرطاس 200	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:11:10.059713+00	2026-09-19 00:11:10.059713+00	\N	f	\N	\N
e512f946-d8cb-4725-9d52-5ba10b7446c5	\N	\N	عمود تيمت ياباني وكاله 125	عمود تيمت ياباني وكاله 125	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:11:57.791363+00	2026-09-19 00:11:57.791363+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
a9375d9c-b63b-4c96-af97-0e2873ddb8c1	\N	\N	جهاز سانيا 150 موديل جديد	جهاز سانيا 150 موديل جديد	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	4900.00	5000.00	0.000	1.000	f	t	2026-09-18 23:50:36.54873+00	2026-09-20 15:41:57.190681+00	\N	f	\N	\N
9f654532-6b8c-4771-971c-52f230388d40	\N	\N	معبا جي دبل يو صيني	معبا جي دبل يو صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	1400.00	1500.00	0.000	1.000	f	t	2026-09-18 23:52:16.232268+00	2026-09-22 21:41:11.350392+00	\N	f	\N	\N
db0d815e-1ca4-42ca-bc0d-8096bb65ec24	\N	\N	والات ياباني 125	والات ياباني 125	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	2400.00	2500.00	0.000	1.000	f	t	2026-09-19 00:04:41.17925+00	2026-09-23 16:39:55.586276+00	\N	f	\N	\N
2f2c2c05-d245-4e20-8c54-47a71cfea035	\N	\N	عمود تيمت ياباني  125 كرتون اغبر	عمود تيمت ياباني  125 كرتون اغبر	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	9ab06b53-a758-492e-81c4-12e1fe1da189	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:13:45.599271+00	2026-09-19 00:13:45.599271+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
24d3229f-f0db-4d11-aa67-034dc3e2b71a	\N	\N	عصافير صيني جي دبل يو 150	عصافير صيني جي دبل يو 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:14:15.393773+00	2026-09-19 00:14:15.393773+00	\N	f	\N	\N
131272c9-8b59-43b2-92da-804c35f8f2f0	\N	\N	عمود والات صيني قرطاس ابيض	عمود والات صيني قرطاس ابيض	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:15:21.883839+00	2026-09-19 00:15:21.883839+00	\N	f	\N	\N
328ea0b9-1827-4250-b2c4-3fcbaf7e45e1	\N	\N	صبرات جير قدام جي دبل يو 200 صيني	صبرات جير قدام جي دبل يو 200 صيني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:16:02.580275+00	2026-09-19 00:16:02.580275+00	\N	f	\N	\N
55fc4ce0-1a21-4d59-99d7-30841a00c698	\N	\N	صبرات تعشيقه جي دبل يو 150	صبرات تعشيقه جي دبل يو 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:16:46.621653+00	2026-09-19 00:16:46.621653+00	\N	f	\N	\N
c70eaab9-1001-4254-8268-520cb9987ff1	\N	\N	صبرات تعشيقه جي دبل يو 200	صبرات تعشيقه جي دبل يو 200	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 00:17:24.424014+00	2026-09-19 00:17:53.941091+00	\N	f	\N	\N
6f0ed932-78e0-4153-b607-b3f4ea3df18d	\N	\N	صبرت جير قدام رزق اكس ثري 200	صبرت جير قدام رزق اكس ثري 200	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 07:02:47.131042+00	2026-09-19 07:02:47.131042+00	\N	f	\N	\N
1f038dad-1816-4604-8661-454ed2b71b97	\N	\N	صبرات هندل X100	صبرات هندل X100	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 07:03:41.299188+00	2026-09-19 07:03:41.299188+00	\N	f	\N	\N
4a582951-6fce-4105-adf3-7a5688cf5f5c	\N	\N	صبرات تعشيقه أبو باكت ازرق 150	صبرات تعشيقه أبو باكت ازرق 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 07:04:26.281726+00	2026-09-19 07:04:26.281726+00	\N	f	\N	\N
4dc9d886-b9fb-457d-902c-7af2670b7aaa	\N	\N	فخذ X100 أبو قرطاس	فخذ X100 أبو قرطاس	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 07:05:30.077975+00	2026-09-19 07:05:30.077975+00	\N	f	\N	\N
c34cd73c-a110-4a40-b2bc-02cdc60110a3	\N	\N	عصيان والات SDM 150	عصيان والات SDM 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	74871a9d-135c-4554-8d4a-d15ddaf85843	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 07:07:53.293642+00	2026-09-19 07:07:53.293642+00	\N	f	\N	\N
77845adf-5c4b-4d00-8f2a-f993f7d62dc7	\N	\N	عصيان والات SDM 200	عصيان والات SDM 200	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	74871a9d-135c-4554-8d4a-d15ddaf85843	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 07:06:56.594579+00	2026-09-19 07:08:06.118523+00	\N	f	\N	\N
96f2d554-9dc6-4cef-b973-14a06acb87d9	\N	\N	عصيان والات أبو شبه حمراء 175	عصيان والات أبو شبه حمراء 175	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 07:09:03.991981+00	2026-09-19 07:09:03.991981+00	\N	f	\N	\N
2a961cdc-3feb-4a12-84b2-f70333fff0b2	\N	\N	سنسلة تيمت CB150	سنسلة تيمت CB150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 07:09:43.575417+00	2026-09-19 07:09:43.575417+00	\N	f	\N	\N
216a5918-d588-45ec-a7c4-55a8dbc6bf54	\N	\N	سنسلة تيمت JW 150	سنسلة تيمت JW 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 07:10:47.21414+00	2026-09-19 07:10:47.21414+00	\N	f	\N	\N
c0ea5aa7-baa8-4c1e-8442-73f073bc5775	\N	\N	دعست بريك X100	دعست بريك X100	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 07:41:04.968936+00	2026-09-19 07:41:04.968936+00	\N	f	\N	\N
72c2f95e-41f3-44c8-93bc-5c030275cafd	\N	\N	سنارت بريك صيني	سنارت بريك صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 07:42:52.970501+00	2026-09-19 07:42:52.970501+00	\N	f	\N	\N
15769069-a14c-4edd-a4d8-fcd15a6418c6	\N	\N	سنارت بريك ياباني SDM	سنارت بريك ياباني SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:21:23.913251+00	2026-09-19 11:21:23.913251+00	\N	f	\N	\N
03adc6d2-e804-4e0f-988b-f2bcae7a1135	\N	\N	دعست سواق ياباني اصل	دعست سواق ياباني اصل	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:24:28.422898+00	2026-09-19 11:24:28.422898+00	\N	f	\N	\N
7f9b418a-7377-4818-b695-d66a98e69daf	\N	\N	دعست راكب كبير	دعست راكب كبير	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:25:00.333761+00	2026-09-19 11:25:00.333761+00	\N	f	\N	\N
8954f536-abcc-4b92-82e2-a4316b017118	\N	\N	دعست راكب طويل	دعست راكب طويل	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:25:33.210616+00	2026-09-19 11:25:33.210616+00	\N	f	\N	\N
8f593fcf-2dd3-4154-a989-a5547ceece05	\N	\N	كوب زيت صينيSDM 125	كوب زيت صينيSDM 125	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:28:06.085056+00	2026-09-19 11:28:06.085056+00	\N	f	\N	\N
d797f67b-a2d3-4e29-9a89-2a454e427dc0	\N	\N	سناد تيمت ياباني تحت	سناد تيمت ياباني تحت	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:28:53.121712+00	2026-09-19 11:28:53.121712+00	\N	f	\N	\N
fb92922f-3849-4e82-8616-bf5a5307b6ac	\N	\N	سناد تيمت ياباني فوق	سناد تيمت ياباني فوق	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:29:31.7789+00	2026-09-19 11:29:31.7789+00	\N	f	\N	\N
a7e79783-f293-488c-a87c-3f50dfd62d48	\N	\N	بمب زيت صيني كره حراري 200	بمب زيت صيني كره حراري 200	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	a73fcf68-3e04-4de8-83b1-b7cb19211437	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:30:43.37276+00	2026-09-19 11:30:43.37276+00	\N	f	\N	\N
c445d28f-a0eb-4f77-9cfd-528c3dd6d344	\N	\N	بمب زيت صيني كره حراري 150	بمب زيت صيني كره حراري 150	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	a73fcf68-3e04-4de8-83b1-b7cb19211437	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:31:18.525773+00	2026-09-19 11:31:18.525773+00	\N	f	\N	\N
f62cb04a-b233-4693-aca3-40e0c9867452	\N	\N	بمب زيت صيني 200 باكت اصفر	بمب زيت صيني 200 باكت اصفر	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:31:58.496492+00	2026-09-19 11:31:58.496492+00	\N	f	\N	\N
57f6fc09-aab2-4e20-bd99-525db327424e	\N	\N	كوب زيت صيني 200 JW	كوب زيت صيني 200 JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:32:50.722437+00	2026-09-19 11:32:50.722437+00	\N	f	\N	\N
64f68c71-1254-4223-a1db-f511f0331dff	\N	\N	بمب زيت صيني SDM 200	بمب زيت صيني SDM 200	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:33:55.729274+00	2026-09-19 11:33:55.729274+00	\N	f	\N	\N
bf6e0ab3-28c7-462b-9719-166db2a2c606	\N	\N	جيرات تيمت صيني 125 SDM	جيرات تيمت صيني 125 SDM	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	74871a9d-135c-4554-8d4a-d15ddaf85843	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:35:05.19746+00	2026-09-19 11:35:05.19746+00	\N	f	\N	\N
7533c31e-45b7-4035-a201-70cc284cee98	\N	\N	جيرات تيمت صيني JW 150	جيرات تيمت صيني JW 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:36:02.355193+00	2026-09-19 11:36:02.355193+00	\N	f	\N	\N
56db6244-0d20-4612-9935-5312471f415e	\N	\N	جيرات سلف صيني الجير الصغير 150 SDM	جيرات سلف صيني الجير الصغير 150 SDM	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	74871a9d-135c-4554-8d4a-d15ddaf85843	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:37:55.983603+00	2026-09-19 11:37:55.983603+00	\N	f	\N	\N
26601c0d-7d24-4a0b-b57e-2644dc83ec7c	\N	\N	جيرات متر عربه حق العلبه أبو باكت اصفر	جيرات متر عربه حق العلبه أبو باكت اصفر	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:38:39.918909+00	2026-09-19 11:38:39.918909+00	\N	f	\N	\N
7afca9de-fc1c-45dd-9d8f-39f5b1b76266	\N	\N	دعست بريك SDM صيني	دعست بريك SDM صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	1400.00	1500.00	0.000	1.000	f	t	2026-09-19 07:11:47.505896+00	2026-09-27 19:07:08.035183+00	\N	f	\N	\N
48c45a44-5f20-4fd7-bf80-95e427064b7b	\N	\N	دعست بريك SDM صيني كبير	دعست بريك SDM صيني كبير	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	1900.00	2000.00	0.000	1.000	f	t	2026-09-19 07:39:33.376907+00	2026-09-27 19:07:42.804314+00	\N	f	\N	\N
bb4ad156-be7d-4668-a978-6f863c3fc36d	\N	\N	علبت بريك فوق صيني SDM	علبت بريك فوق صيني SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:40:07.840258+00	2026-09-19 11:40:07.840258+00	\N	f	\N	\N
e8fa0ecd-ade2-489c-bfcc-f7177adab553	\N	\N	علبت بريك فوق صيني نيزك	علبت بريك فوق صيني نيزك	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	439fd0bd-3d2d-4967-b9bd-54261105d6e0	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:39:14.006866+00	2026-09-19 11:40:20.897019+00	\N	f	\N	\N
4ea0fe75-290c-4fa2-8b84-6455d3dc8bfa	\N	\N	ربعات سانيا 46 SDM	ربعات سانيا 46 SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:41:13.195517+00	2026-09-19 11:41:13.195517+00	\N	f	\N	\N
5b3fec0f-f407-415e-ae82-81f7c553eb20	\N	\N	ربعات سانيا 46 باكت ابيض	ربعات سانيا 46 باكت ابيض	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:41:59.651764+00	2026-09-19 11:41:59.651764+00	\N	f	\N	\N
410fa026-8d8c-4c2a-acca-28c0579d4343	\N	\N	ربعات X100	ربعات X100	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	0.000	f	t	2026-09-19 11:42:32.906587+00	2026-09-19 11:42:32.906587+00	\N	f	\N	\N
6c4c114c-c97f-4c99-a933-1a3a803de3df	\N	\N	حنفي بترول SDM بولت	حنفي بترول SDM بولت	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:43:40.18782+00	2026-09-19 11:43:40.18782+00	\N	f	\N	\N
70e6f420-e6aa-4ced-9b39-1fb5ba620a41	\N	\N	حنفي بترول JW	حنفي بترول JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:44:28.0603+00	2026-09-19 11:44:28.0603+00	\N	f	\N	\N
8afd4534-8453-4df7-9926-07ee80e34996	\N	\N	ربعات ياباني طقم	ربعات ياباني طقم	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:45:09.715297+00	2026-09-19 11:45:09.715297+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
c2eb16d6-375c-45df-9b6f-a47ee84e4fc3	\N	\N	ربعت تشغيل ياباني	ربعت تشغيل ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:45:49.926977+00	2026-09-19 11:45:49.926977+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
96115a79-ab36-4643-9ed4-15d8f30a5609	\N	\N	طقم ربعات صيني	طقم ربعات صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:46:20.776688+00	2026-09-19 11:46:20.776688+00	\N	f	\N	\N
941753d4-fd19-4060-a4ae-ed4e8f41eddb	\N	\N	طقم ربعات صيني ناقص غطا بترول	طقم ربعات صيني ناقص غطا بترول	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:47:12.385413+00	2026-09-19 11:47:12.385413+00	\N	f	\N	\N
a5a042ef-1faf-492c-8e68-248e0782a023	\N	\N	ربعت امان ياباني	ربعت امان ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:47:57.273767+00	2026-09-19 11:47:57.273767+00	\N	f	\N	\N
fc939814-0b00-4e41-bbb0-c8d2ca758359	\N	\N	ربعت سانيا X3	ربعت سانيا X3	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:49:21.0075+00	2026-09-19 11:49:21.0075+00	\N	f	\N	\N
41ca31bc-86ff-4368-96a8-526737caa327	\N	\N	ونكر سلف ياباني	ونكر سلف ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:51:42.940348+00	2026-09-19 11:51:42.940348+00	\N	f	\N	\N
936867cd-1efd-4e46-a4d7-0ac622999f07	\N	\N	ونكر سلف صيني	ونكر سلف صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:52:20.045898+00	2026-09-19 11:52:20.045898+00	\N	f	\N	\N
0e4e4db4-3e6d-4729-9687-9f10b858f952	\N	\N	ونكر كلتش ياباني	ونكر كلتش ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:53:05.838603+00	2026-09-19 11:53:05.838603+00	\N	f	\N	\N
9f9fafd2-212c-4c83-b054-a30f2da8c303	\N	\N	ونكر كلتش صيني SDM	ونكر كلتش صيني SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:53:48.219483+00	2026-09-19 11:53:48.219483+00	\N	f	\N	\N
dfcedee9-3ef6-46d5-a893-09cc03491e94	\N	\N	ونكر كلتش صيني	ونكر كلتش صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:55:07.806601+00	2026-09-19 11:55:07.806601+00	\N	f	\N	\N
c24f92c4-6e0d-4198-9f1d-7ba53b505cd8	\N	\N	كته سلف صيني JW	كته سلف صيني JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:55:59.197426+00	2026-09-19 11:55:59.197426+00	\N	f	\N	\N
336703e4-eea4-4551-aeec-536d79683a10	\N	\N	كته سلف صيني كره حراري	كته سلف صيني كره حراري	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	a73fcf68-3e04-4de8-83b1-b7cb19211437	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:57:28.596656+00	2026-09-19 11:57:28.596656+00	\N	f	\N	\N
b0c577d0-77ed-4e06-9f05-efa339b57baa	\N	\N	اصلاح سلف صيني 150 JW	اصلاح سلف صيني 150 JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:58:34.352506+00	2026-09-19 11:58:34.352506+00	\N	f	\N	\N
9cff5399-c172-4a20-8204-9b1d932acd0a	\N	\N	اصلاح سلف صيني 200 JW	اصلاح سلف صيني 200 JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 11:59:51.119431+00	2026-09-19 11:59:51.119431+00	\N	f	\N	\N
1380b1db-8d5e-4044-a3fe-b1742548b9c4	\N	\N	مجنيك صيني 150 JW	مجنيك صيني 150 JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:00:36.939022+00	2026-09-19 12:00:36.939022+00	\N	f	\N	\N
4bdac717-8cbe-4ca8-bdbf-ef08af1d36be	\N	\N	مجنيك صيني 200 JW	مجنيك صيني 200 JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:01:16.385838+00	2026-09-19 12:01:16.385838+00	\N	f	\N	\N
c034a685-4b6c-46b2-97b7-4a8425bc2608	\N	\N	جير سلف صيني 200 أبو بتكت اصفر	جير سلف صيني 200 أبو بتكت اصفر	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:02:09.816921+00	2026-09-19 12:02:09.816921+00	\N	f	\N	\N
6dba5a24-f7ad-4edd-97fc-bffb18376e4e	\N	\N	جير سلف صيني 200 أبو بتكت اسود	جير سلف صيني 200 أبو بتكت اسود	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:02:47.363463+00	2026-09-19 12:02:47.363463+00	\N	f	\N	\N
bedf0560-328a-4730-92e1-a6e3b82a1092	\N	\N	مثلث سره ياباني	مثلث سره ياباني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:08:10.021684+00	2026-09-19 12:08:10.021684+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
219fe0ac-172e-41d7-9c70-7d608ca05d29	\N	\N	سنسلة تيمت ياباني	سنسلة تيمت ياباني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:10:19.130409+00	2026-09-19 12:10:19.130409+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
7d3bab4d-bcfc-4d1c-a543-1392c0214eb3	\N	\N	مثلث تحت دوزك صيني	مثلث تحت دوزك صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	06e012d3-4d3a-412f-a621-37b46f80464e	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:12:00.819426+00	2026-09-19 12:13:05.573307+00	\N	f	\N	\N
d30a515d-18a4-4861-8dff-e888f585adbe	\N	\N	مثلث فوق سانيا46	مثلث فوق سانيا46	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:13:48.8736+00	2026-09-19 12:13:48.8736+00	\N	f	\N	\N
5d186234-03f8-4cf9-b526-f82d6b949076	\N	\N	طاره كنويس صيني	طاره كنويس صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:14:39.500968+00	2026-09-19 12:14:39.500968+00	\N	f	\N	\N
a717dc1d-2b1e-4491-bd4d-24d08b4aa04d	\N	\N	ساعة جير ورا JW	ساعة جير ورا JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:15:37.222533+00	2026-09-19 12:15:37.222533+00	\N	f	\N	\N
6619242e-e1c8-49a0-b92a-01cd8ecc44b0	\N	\N	ساعةX100	ساعةX100	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:16:35.519845+00	2026-09-19 12:16:35.519845+00	\N	f	\N	\N
c04f8ba1-6658-4174-b639-a528241bd1ce	\N	\N	صحن بريك ياباني	صحن بريك ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:17:18.83115+00	2026-09-19 12:17:18.83115+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
9b3cf0b4-c302-477e-af39-9b3395c0581a	\N	\N	صحن بريك كبير حق زوجن او سانيا	صحن بريك كبير حق زوجن او سانيا	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:17:51.639085+00	2026-09-19 12:17:51.639085+00	\N	f	\N	\N
fca42075-f8b2-4ebf-a767-ec6f2eab4cef	\N	\N	وصلت بريك صيني	وصلت بريك صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:18:58.440224+00	2026-09-19 12:18:58.440224+00	\N	f	\N	\N
669687c9-e50a-477a-a6be-c0395e05169d	\N	\N	وصلت بريك معا المسمار دبل صيني	وصلت بريك معا المسمار دبل صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:21:08.093682+00	2026-09-19 12:21:08.093682+00	\N	f	\N	\N
65828d3a-e750-414d-a62f-369fdf449eee	\N	\N	جيرات قدام دوزك	جيرات قدام دوزك	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	06e012d3-4d3a-412f-a621-37b46f80464e	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:22:44.39608+00	2026-09-19 12:22:44.39608+00	\N	f	\N	\N
249982f8-6a14-477a-8e74-3d896cddd9fb	\N	\N	جير قدام صيني تمساح قرطاس اسود	جير قدام صيني تمساح قرطاس اسود	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:23:29.577008+00	2026-09-19 12:23:43.621163+00	\N	f	\N	\N
514ff10c-0aae-4dcf-b80a-616b4a4054f6	\N	\N	جير قدامX100	جير قدامX100	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:24:23.543379+00	2026-09-19 12:24:23.543379+00	\N	f	\N	\N
84603c72-dcd1-467d-9391-56b902994498	\N	\N	جير قدام JW 200	جير قدام JW 200	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:25:21.818298+00	2026-09-19 12:25:21.818298+00	\N	f	\N	\N
e599c0a3-a99f-4acd-9440-dcbe04e3acb3	\N	\N	جير قدام JW 150	جير قدام JW 150	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:26:08.238344+00	2026-09-19 12:26:08.238344+00	\N	f	\N	\N
eadd35c2-b9e9-4964-8197-a7792bc389ce	\N	\N	جير قدام SDM 150	جير قدام SDM 150	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:26:50.822148+00	2026-09-19 12:26:50.822148+00	\N	f	\N	\N
2301ae6a-b219-4356-93b5-76b79d0a5bee	\N	\N	جير قدام ياباني 14	جير قدام ياباني 14	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:28:03.791187+00	2026-09-19 12:28:03.791187+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
9745492e-5a65-4f2e-ba55-437f7b221f70	\N	\N	ميزنيات ياباني	ميزنيات ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:28:56.51157+00	2026-09-19 12:28:56.51157+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
52847e9c-7117-4b4b-ad10-7a71989405f7	\N	\N	حدائد هون	حدائد هون	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 12:29:49.216053+00	2026-09-19 12:29:49.216053+00	\N	f	\N	\N
84ac3f8f-2810-4825-8f72-dcfed72a50f3	\N	\N	مرايات هندي سود	مرايات هندي سود	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	1000.00	1200.00	0.000	1.000	f	t	2026-09-19 13:25:31.619759+00	2026-09-19 13:26:57.218006+00	\N	f	\N	\N
55b47be3-5025-4db9-957b-72092714f1c5	\N	\N	تلبيست مخده سانيا	تلبيست مخده سانيا	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-19 13:24:42.219375+00	2026-09-19 13:27:20.505937+00	\N	f	\N	\N
3cccd0e8-c588-4633-a6b6-47f080d2b98f	\N	\N	تلبيست مخده ياباني من دون اسم	تلبيست مخده ياباني من دون اسم	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1450.00	1500.00	0.000	1.000	f	t	2026-09-19 13:31:47.741109+00	2026-09-19 13:31:47.741109+00	\N	f	\N	\N
17974d65-2b39-4e66-b3e9-54e13ea3f066	\N	\N	تلبيست مخده صيني ملون	تلبيست مخده صيني ملون	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	0.000	f	t	2026-09-19 13:32:25.296492+00	2026-09-19 13:32:25.296492+00	\N	f	\N	\N
f3f6271f-50d7-42b2-8a23-5d688fd0042d	\N	\N	تلبيست مخده X100 ملون احمر	تلبيست مخده X100 ملون احمر	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	0.000	f	t	2026-09-19 13:33:17.926176+00	2026-09-19 13:33:17.926176+00	\N	f	\N	\N
a8226c8a-ba78-42fa-8335-fa056cb37be8	\N	\N	تلبيست مخده X100	تلبيست مخده X100	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-19 13:34:03.915403+00	2026-09-19 13:34:03.915403+00	\N	f	\N	\N
e4cef90c-932f-4d2e-823c-5321dadcdbd5	\N	\N	بنكه ورا صيني	بنكه ورا صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	2950.00	3000.00	0.000	1.000	f	t	2026-09-19 13:34:57.564819+00	2026-09-19 13:34:57.564819+00	\N	f	\N	\N
1e3af252-7692-48f5-8bf8-7bce64af4731	\N	\N	هوايه	هوايه	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 13:35:33.106501+00	2026-09-19 13:35:33.106501+00	\N	f	\N	\N
942cdcf3-c9dd-496a-becd-ae09d1d60333	\N	\N	بطاريه SMZ	بطاريه SMZ	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	7450.00	7500.00	0.000	1.000	f	t	2026-09-19 13:36:29.418625+00	2026-09-19 13:36:29.418625+00	\N	f	\N	\N
66658002-0da1-416c-bbcd-c6ce034ab1dd	\N	\N	سكان ياباني	سكان ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	2450.00	2500.00	0.000	1.000	f	t	2026-09-19 13:38:06.798372+00	2026-09-19 13:38:06.798372+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
1ba1671c-a827-47b0-a2e5-5fd032ac2490	\N	\N	مرتزي ياباني	مرتزي ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 13:40:15.118325+00	2026-09-19 13:40:15.118325+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
9851c408-0596-48ea-8fc1-7bc214717a97	\N	\N	مقص صيني 17	مقص صيني 17	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 13:40:46.880192+00	2026-09-19 13:40:46.880192+00	\N	f	\N	\N
c885a8d7-a904-45fc-9709-e2477e1717d1	\N	\N	كور صيني 150 احمر	كور صيني 150 احمر بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 13:42:12.802315+00	2026-09-19 13:45:04.464647+00	\N	f	\N	\N
d2392f84-9e3a-4634-9ae9-423dbc4c94f8	\N	\N	كور صيني 150 احمر هوايه	كور صيني 150 احمر هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 13:44:35.314385+00	2026-09-19 13:45:17.205156+00	\N	f	\N	\N
3458f5c4-2c0c-46f0-946e-ad7c6f9904f7	\N	\N	كور صيني 150 ازق هوايه	كور صيني 150 ازق هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:45:48.441399+00	2026-09-19 14:45:48.441399+00	\N	f	\N	\N
e712b57a-91d2-4df7-bb62-b37a61a74caa	\N	\N	كور صيني 150 ازق بطاريه	كور صيني 150 ازق بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:44:54.231262+00	2026-09-19 14:46:07.251008+00	\N	f	\N	\N
8c9a4b97-f1c4-4b01-8f0f-fbc524cf339f	\N	\N	كور صيني 200 اسود بطاريه	كور صيني 200 اسود بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:47:07.843039+00	2026-09-19 14:47:07.843039+00	\N	f	\N	\N
3d462353-8191-4368-9931-4649b667a19f	\N	\N	كور صيني 200 اسود هوايه	كور صيني 200 اسود هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:47:45.3187+00	2026-09-19 14:47:45.3187+00	\N	f	\N	\N
c322d7d5-2182-4e07-ba97-c520d0945102	\N	\N	كور ياباني اسود 125 H بطاريه	كور ياباني اسود 125 H بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:48:53.388193+00	2026-09-19 14:48:53.388193+00	\N	f	\N	a3ae5599-bae3-4744-9037-653d1e315355
9c0041db-df42-4304-9f15-b10db85e4e65	\N	\N	كور ياباني اسود 125 H هوايه	كور ياباني اسود 125 H هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:49:48.418112+00	2026-09-19 14:49:48.418112+00	\N	f	\N	\N
0ecc2889-d920-42f7-9607-ff96760a98be	\N	\N	كور صيني بني 150 بطاريه	كور صيني بني 150 بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:50:43.464743+00	2026-09-19 14:50:43.464743+00	\N	f	\N	\N
f229277f-f43a-4d40-9c77-0e7eb7fed3b9	\N	\N	كور صيني بني 150 هوايه	كور صيني بني 150 هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:51:32.217356+00	2026-09-19 14:51:32.217356+00	\N	f	\N	\N
fecdac57-87a0-4878-815c-53df800feea6	\N	\N	كور ياباني احمر 125H بطاريه	كور ياباني احمر 125H بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:54:12.57237+00	2026-09-19 14:54:12.57237+00	\N	f	\N	a3ae5599-bae3-4744-9037-653d1e315355
4056e892-b87c-4d1a-8ab6-cc1f0b6d6cae	\N	\N	كور ياباني احمر 125H هوايه	كور ياباني احمر 125H هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:55:04.501064+00	2026-09-19 14:55:04.501064+00	\N	f	\N	a3ae5599-bae3-4744-9037-653d1e315355
61ebd824-d33d-463c-bfc2-91886b7673aa	\N	\N	كور ياباني احمر 125 بطاريه	كور ياباني احمر 125 بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	0.000	f	t	2026-09-19 14:55:59.154626+00	2026-09-19 14:55:59.154626+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
cb2498f6-7072-40a7-ac66-d0e5310decae	\N	\N	كور ياباني احمر 125 هوايه	كور ياباني احمر 125 هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-19 14:56:50.162588+00	2026-09-19 14:56:50.162588+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
d71843b4-4a99-459d-898f-54e614137a58	\N	\N	كور ياباني ازرق 125H بطاريه	كور ياباني ازرق 125H بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:57:57.826395+00	2026-09-19 14:57:57.826395+00	\N	f	\N	a3ae5599-bae3-4744-9037-653d1e315355
17cb9df6-89f3-47f5-a2f6-c105aa579aae	\N	\N	بنكه قدام ياباني	بنكه قدام ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	4900.00	5000.00	0.000	1.000	f	t	2026-09-19 12:31:32.859728+00	2026-09-21 20:07:17.162691+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
daff3a3e-7f55-4c85-898c-bbcaa22ddb5c	\N	\N	كور ياباني ازرق 125H هوايه	كور ياباني ازرق 125H هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:58:34.057837+00	2026-09-19 14:58:34.057837+00	\N	f	\N	a3ae5599-bae3-4744-9037-653d1e315355
23b706ce-3ffe-4a49-9860-ad3ce227c639	\N	\N	كور صيني ازرق 200 بطاريه	كور صيني ازرق 200 بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 14:59:32.461552+00	2026-09-19 14:59:32.461552+00	\N	f	\N	\N
52346813-1d58-4cd7-9de6-02057c8b1748	\N	\N	كور صيني ازرق 200 هوايه	كور صيني ازرق 200 هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:00:10.23101+00	2026-09-19 15:00:10.23101+00	\N	f	\N	\N
1ef1b9f1-9c88-494f-bd5d-fa2fae0dd2eb	\N	\N	كور صيني احمر 200 بطاريه	كور صيني احمر 200 بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:01:06.685144+00	2026-09-19 15:01:06.685144+00	\N	f	\N	\N
1c253ba6-bb8a-44a5-9dae-580bf90e5862	\N	\N	كور صيني احمر 200 هوايه	كور صيني احمر 200 هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:01:58.046827+00	2026-09-19 15:01:58.046827+00	\N	f	\N	\N
08b3a3b7-6932-41b0-a34a-bc7068092967	\N	\N	كور ياباني فضي 125 بطاريه	كور ياباني فضي 125 بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-19 15:12:31.472344+00	2026-09-19 15:12:31.472344+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
7b6e298b-0d96-45d5-9be4-882ee435ef63	\N	\N	كور ياباني فضي 125 هوايه	كور ياباني فضي 125 هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-19 15:13:18.991061+00	2026-09-19 15:13:18.991061+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
b87eb4a8-75d3-4c7c-b926-33bfde397e1e	\N	\N	بيرنج GL 6201	بيرنج GL 6201	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	7dbfdca7-0d06-49d8-8c63-9e104b5c3bb5	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:15:56.414107+00	2026-09-19 15:15:56.414107+00	\N	f	\N	\N
421c2326-c1ad-4c5b-9e00-ee08807ff971	\N	\N	بيرنج جي دبليو 6302	بيرنج JW 6302	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-19 15:20:47.173+00	2026-09-19 15:21:14.574785+00	\N	f	\N	\N
d2355339-3f9e-4404-b6d7-021e388e58fc	\N	\N	بيرنج JW 6204	بيرنج JW 6204	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-19 15:22:09.8117+00	2026-09-19 15:22:09.8117+00	\N	f	\N	\N
daa8f77d-169d-4c00-b2dd-eb2dc4fc9892	\N	\N	بيرنج JW 6202	بيرنج JW 6202	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-19 15:23:11.915171+00	2026-09-19 15:23:11.915171+00	\N	f	\N	\N
c4085d32-2dab-404b-bf21-8b2e00861141	\N	\N	بيرنج ARB 6200	بيرنج ARB 6200	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f4b7fa20-26be-403d-9811-f72510ea5de0	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:18:42.525677+00	2026-09-19 15:24:25.225761+00	\N	f	\N	\N
e08f4e57-7338-4a3f-a1a8-247f52cbbeb2	\N	\N	بيرنج ARB6203	بيرنج ARB6203	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f4b7fa20-26be-403d-9811-f72510ea5de0	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:25:51.641324+00	2026-09-19 15:25:51.641324+00	\N	f	\N	\N
5ca566ea-5f80-46d7-bfdb-a909a3ed6e44	\N	\N	بيرنج 6201 SDM	بيرنج 6201 SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:26:54.686291+00	2026-09-19 15:26:54.686291+00	\N	f	\N	\N
711fb475-eaf1-4106-a8e6-b2013ba19ca4	\N	\N	بيرنج SDM 6201	بيرنج SDM 6201	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:28:15.078936+00	2026-09-19 15:28:15.078936+00	\N	f	\N	\N
c1837e2e-c331-4e19-bbb1-b9f3d504f30c	\N	\N	بيرنج OPPLE 6202	بيرنج OPPLE 6202	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	08c5d8cb-2d49-48d9-b0c0-ffb872ba793b	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:29:55.733368+00	2026-09-19 15:29:55.733368+00	\N	f	\N	\N
23448fc7-bf39-4773-be4e-55c3da5af0b2	\N	\N	بيرنج OPPLE 6302	بيرنج OPPLE 6302	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	08c5d8cb-2d49-48d9-b0c0-ffb872ba793b	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	0.000	f	t	2026-09-19 15:30:24.560777+00	2026-09-19 15:30:24.560777+00	\N	f	\N	\N
dbad7cdb-d0ff-4f19-bd9f-a4a58be3282b	\N	\N	بيرنج الوفاء 6302	بيرنج الوفاء 6302	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	d68c5a1b-7ecb-41ca-9532-470b35d5a359	\N	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:31:02.732327+00	2026-09-19 15:31:02.732327+00	\N	f	\N	\N
a3c6a2b8-6de2-4c8a-a3a4-9b08b9ec2e30	\N	\N	بيرنج H-CENTO 6302+	بيرنج H-CENTO 6302+	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:32:06.223954+00	2026-09-19 15:32:16.40653+00	\N	f	\N	\N
41203e60-e149-49cd-a7e5-69cab3d3251e	\N	\N	بيرنج SDM 6302++	بيرنج SDM 6302++	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	\N	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:33:09.405917+00	2026-09-19 15:33:09.405917+00	\N	f	\N	\N
086daa33-623d-470b-9b7f-e561c73ca5f2	\N	\N	بيرنج RPT 6201	بيرنج RPT 6201	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:34:01.684685+00	2026-09-19 15:34:01.684685+00	\N	f	\N	\N
3172a9cd-044e-4ab2-b4d2-49924f59e290	\N	\N	جيرات علبت عربه باكت ازرق	جيرات علبت عربه باكت ازرق	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-19 15:34:59.242595+00	2026-09-19 15:34:59.242595+00	\N	f	\N	\N
d6bf5a8c-cfc7-45f4-a459-ce6bb0a4bcfd	\N	\N	بيرنج KG6300 ZZ	بيرنج KG6300 ZZ	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 15:35:34.871441+00	2026-09-19 15:35:34.871441+00	\N	f	\N	\N
0bee7258-8b93-4887-bc41-8f3e558b2538	\N	\N	بيرنج H-CENTO 6202+	بيرنج H-CENTO 6202+	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:36:25.596917+00	2026-09-19 15:36:25.596917+00	\N	f	\N	\N
d89490d8-eff9-4fb2-8519-ffe6ed518536	\N	\N	بيرنج كره حراري 6302	بيرنج كره حراري 6302	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	a73fcf68-3e04-4de8-83b1-b7cb19211437	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:37:37.900795+00	2026-09-19 15:37:37.900795+00	\N	f	\N	\N
585ce4c9-3eb9-4bff-a867-b92f0b347bf5	\N	\N	بيرنج 6301\\38	بيرنج 6301\\38	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:38:21.55976+00	2026-09-19 15:38:21.55976+00	\N	f	\N	\N
a9c91c61-b5d7-43e1-9eba-151bc9c50dfe	\N	\N	بيرنج كره حراري 6304\\P5CS14	بيرنج كره حراري 6304\\P5CS14	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	a73fcf68-3e04-4de8-83b1-b7cb19211437	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:39:36.532891+00	2026-09-19 15:39:36.532891+00	\N	f	\N	\N
c7fec1e3-b787-441c-9330-ed1a20630569	\N	\N	بيرنج X100 (6205)	بيرنج X100 (6205)	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:40:34.833163+00	2026-09-19 15:40:34.833163+00	\N	f	\N	\N
a42996fe-72c2-4bc6-9374-cb233161624d	\N	\N	بيرنج يدالكرين ياباني صغير	بيرنج يدالكرين ياباني صغير	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 15:41:39.184865+00	2026-09-19 15:41:39.184865+00	\N	f	\N	\N
96762054-f0e8-4af4-8a52-a448eda4b0e9	\N	\N	بيرنج ABH 6203	بيرنج ABH 6203	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:42:29.549807+00	2026-09-19 15:42:29.549807+00	\N	f	\N	\N
24303e42-2dc8-4c5b-81d6-bebb0c41b3eb	\N	\N	بيرنج SDM 6302+	بيرنج SDM 6302+	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:43:54.228494+00	2026-09-19 15:43:54.228494+00	\N	f	\N	\N
6a6f3263-f6c6-40b6-8acf-90bda66e396d	\N	\N	بيرنج FJR 6203	بيرنج FJR 6203	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:44:59.120096+00	2026-09-19 15:44:59.120096+00	\N	f	\N	\N
f497176c-39bc-4daf-bc9c-03bc0ba761c9	\N	\N	بيرنج NSK 6002	بيرنج NSK 6002	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:45:39.468119+00	2026-09-19 15:45:39.468119+00	\N	f	\N	\N
00b1cb4b-ff32-46f4-a482-0da6cb6931e9	\N	\N	بيرنج ARB 6203	بيرنج ARB 6203	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f4b7fa20-26be-403d-9811-f72510ea5de0	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:46:45.128048+00	2026-09-19 15:46:45.128048+00	\N	f	\N	\N
cb28a837-b286-49e7-bc0b-2e7fc7cf87d1	\N	\N	بيرنج SDM 6202ZZ+0.5	بيرنج SDM 6202ZZ+0.5	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-19 15:47:15.503012+00	2026-09-19 15:47:15.503012+00	\N	f	\N	\N
bfe5d4a8-4069-40af-9887-7ba4a4d04137	\N	\N	بيرنج الوفاء 6301	بيرنج الوفاء 6301	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	d68c5a1b-7ecb-41ca-9532-470b35d5a359	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-19 15:48:02.763914+00	2026-09-19 15:48:02.763914+00	\N	f	\N	\N
67b2d68b-9d03-4b94-8261-cc445ec11b92	\N	\N	بيرنج اليوسنج 6202	بيرنج اليوسنج 6202	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:49:00.887388+00	2026-09-19 15:49:00.887388+00	\N	f	\N	\N
31a5c2e3-fee7-4352-bc49-2f35f2486d2d	\N	\N	بيرنج اليوسنج 6302	بيرنج اليوسنج 6302	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:49:45.902035+00	2026-09-19 15:49:45.902035+00	\N	f	\N	\N
08bae2b8-58ae-46a3-a30e-aaae2c33c4ab	\N	\N	زيت JW	زيت JW	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	f752c58a-c54b-44a9-bf11-7b9b9d920cec	3bb255df-3c02-4951-b537-cce8881e3004	1900.00	2000.00	0.000	1.000	f	t	2026-09-20 14:52:37.341371+00	2026-09-20 14:52:37.341371+00	\N	f	\N	\N
80e5f29e-e3ec-4293-bd3c-3a335ab2477d	\N	\N	بيرنج نيزك 6204	بيرنج نيزك 6204	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	439fd0bd-3d2d-4967-b9bd-54261105d6e0	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	750.00	0.000	1.000	f	t	2026-09-19 15:19:45.395393+00	2026-09-21 00:09:41.304862+00	\N	f	\N	\N
a7887b2b-34d2-45cb-9552-4938b2a803e5	\N	\N	زيت شل	زيت شل	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	61b012dd-1fd4-4377-9249-0a0fb48b6ee6	3bb255df-3c02-4951-b537-cce8881e3004	2300.00	2400.00	0.000	1.000	f	t	2026-09-20 14:59:03.750163+00	2026-09-20 14:59:03.750163+00	\N	f	\N	\N
b1aaa196-503a-4f34-9c59-467c768967c5	\N	\N	سم بريك	سم بريك	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	\N	3bb255df-3c02-4951-b537-cce8881e3004	450.00	500.00	0.000	1.000	f	t	2026-09-20 15:00:53.507196+00	2026-09-20 15:00:53.507196+00	\N	f	\N	\N
6cfe29ff-540e-4ec5-a7d4-ad334ba32128	\N	\N	ماده كبير ابو جمل	ماده كبير ابو جمل	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	\N	3bb255df-3c02-4951-b537-cce8881e3004	450.00	500.00	0.000	1.000	f	t	2026-09-20 15:03:45.471225+00	2026-09-20 15:03:45.471225+00	\N	f	\N	\N
e6a8f397-e3e0-4917-bd53-fcfecc5f84c2	\N	\N	ماده صغير	ماده صغير	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	\N	3bb255df-3c02-4951-b537-cce8881e3004	450.00	500.00	0.000	0.000	f	t	2026-09-20 15:04:54.509854+00	2026-09-20 15:04:54.509854+00	\N	f	\N	\N
2af9ddc8-4b0d-4044-8811-3dec3afd2816	\N	\N	بخاخ كلبيتر	بخاخ كلبيتر	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	\N	3bb255df-3c02-4951-b537-cce8881e3004	950.00	1000.00	0.000	1.000	f	t	2026-09-20 15:07:05.7193+00	2026-09-20 15:07:05.7193+00	\N	f	\N	\N
4344e543-5c9f-486d-b18d-342fa1cda47c	\N	\N	بخاخ اخضر	بخاخ اخضر	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	\N	3bb255df-3c02-4951-b537-cce8881e3004	800.00	1000.00	0.000	1.000	f	t	2026-09-20 15:09:57.463682+00	2026-09-20 15:09:57.463682+00	\N	f	\N	\N
05fa1424-9537-454d-832a-d48d708c4e31	\N	\N	بخاخ اسود	بخاخ اسود	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	\N	3bb255df-3c02-4951-b537-cce8881e3004	800.00	1000.00	0.000	1.000	f	t	2026-09-20 15:10:54.215125+00	2026-09-20 15:10:54.215125+00	\N	f	\N	\N
1137edf8-accd-40a6-b7ee-6d64c815caf1	\N	\N	بخاخ رصاصي مطفي	بخاخ رصاصي مطفي	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	\N	3bb255df-3c02-4951-b537-cce8881e3004	800.00	1000.00	0.000	1.000	f	t	2026-09-20 15:12:01.78079+00	2026-09-20 15:12:01.78079+00	\N	f	\N	\N
8cbee3db-8535-4deb-97e9-49c258a8405e	\N	\N	بخاخ رصاصي لمعه	بخاخ رصاصي لمعه	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	\N	3bb255df-3c02-4951-b537-cce8881e3004	800.00	1000.00	0.000	1.000	f	t	2026-09-20 15:12:50.938199+00	2026-09-20 15:12:50.938199+00	\N	f	\N	\N
17e298c1-347f-4d83-bfa4-0e4ed5d1f7b9	\N	\N	زيت بترومين	زيت بترومين	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	d3e21c96-2599-4408-a931-a05f5f0cd4bb	3bb255df-3c02-4951-b537-cce8881e3004	2100.00	2200.00	0.000	1.000	f	t	2026-09-20 15:16:23.209077+00	2026-09-20 15:16:23.209077+00	\N	f	\N	\N
d3dd2adc-6df9-47f0-86af-1b868070f219	\N	\N	كنويس SDM	كنويس SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-20 15:26:43.272683+00	2026-09-20 15:26:43.272683+00	\N	f	\N	\N
896a5461-677a-4fc6-ac93-d3314cbfd684	\N	\N	كنويس JW	كنويس JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	1150.00	1200.00	0.000	1.000	f	t	2026-09-20 15:27:34.749487+00	2026-09-20 15:27:34.749487+00	\N	f	\N	\N
949a701a-6a24-48ba-9ddf-36df779c9807	\N	\N	بستون ورنجات ياباني 125	بستون ورنجات ياباني 125	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-20 16:40:40.102236+00	2026-09-20 16:40:40.102236+00	\N	f	\N	\N
a7d95b08-0d2d-4509-b3e2-fc3bc62d98bf	\N	\N	فحمات سلف صيني 150 كرا حراري	فحمات سلف صيني 150 كرا حراري	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	a73fcf68-3e04-4de8-83b1-b7cb19211437	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	1450.00	1500.00	0.000	1.000	f	t	2026-09-20 16:51:40.771719+00	2026-09-20 16:51:40.771719+00	\N	f	\N	\N
1992e98c-4fbf-4210-82ad-91c8ca96a679	\N	\N	دعسات وسط JW	دعسات وسط JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-20 17:24:38.485958+00	2026-09-20 17:24:38.485958+00	\N	f	\N	\N
e20967e2-77a4-4bc5-9bb5-b45b65858df4	\N	\N	اسبرنج سقمه كبير	اسبرنج سقمه كبير	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	90.00	100.00	0.000	1.000	f	t	2026-09-20 17:45:02.479989+00	2026-09-20 17:45:02.479989+00	\N	f	\N	\N
fa4db2cb-96ee-4b13-a939-fdebaf508553	\N	\N	اسبرنج دعست بريك	اسبرنج دعست بريك	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	90.00	100.00	0.000	1.000	f	t	2026-09-20 18:09:05.751669+00	2026-09-20 18:09:05.751669+00	\N	f	\N	\N
c5998fef-4515-4465-a8cb-a9e96d543d51	\N	\N	سفنج هوايه	سفنج هوايه	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	0.000	f	t	2026-09-20 18:26:23.423278+00	2026-09-20 18:26:23.423278+00	\N	f	\N	\N
11ed1686-50e2-4b62-83ea-3f9ec7be1324	\N	\N	يدت ليور  صيني اكس اثري	يدت ليور  صيني اكس اثري	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-20 19:09:21.414651+00	2026-09-20 19:09:21.414651+00	\N	f	\N	\N
a04ba723-d012-4795-bfef-5f0930da384f	\N	\N	مسمار صباع كلتش	مسمار صباع كلتش	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	90.00	100.00	0.000	1.000	f	t	2026-09-20 19:12:28.356429+00	2026-09-20 19:12:28.356429+00	\N	f	\N	\N
2f1b2410-06a9-4a81-a2f2-00b1116960e5	\N	\N	جلب اسطب	جلب اسطب	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	40.00	50.00	0.000	1.000	f	t	2026-09-20 23:37:29.977212+00	2026-09-20 23:37:29.977212+00	\N	f	\N	\N
fc6ea8ce-3aa2-471c-a638-5492f831e7e6	\N	\N	صباع كلتش JW	صباع كلتش JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	600.00	700.00	0.000	1.000	f	t	2026-09-20 19:13:25.738002+00	2026-09-20 19:14:07.369283+00	\N	f	\N	\N
56f9f2bb-b171-40e9-86bb-28eab2504980	\N	\N	خبطه كلتش صيني	خبطه كلتش صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-20 19:15:09.324326+00	2026-09-20 19:15:09.324326+00	\N	f	\N	\N
054c4d9c-89b0-4367-b349-34d4ef4858f6	\N	\N	خبطه ليور صيني	خبطه ليور صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-20 19:15:49.202412+00	2026-09-20 19:15:49.202412+00	\N	f	\N	\N
2c94f75f-ef17-4da1-9a21-6c3c8324c620	\N	\N	بوش مقص ياباني	بوش مقص ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	1900.00	2000.00	0.000	1.000	f	t	2026-09-19 12:11:02.04962+00	2026-09-20 19:16:37.556354+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
ef8c2ba6-2961-4dc4-91a5-e4807ad8a02d	\N	\N	نص ونكر ليور  JW	نص ونكر ليور  JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	250.00	300.00	0.000	1.000	f	t	2026-09-20 19:27:24.471748+00	2026-09-20 19:27:24.471748+00	\N	f	\N	\N
78a50f8f-fe15-49d2-96c9-8603051aa1b9	\N	\N	سنارة بريك ياباني	سنارة بريك ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-20 20:29:57.302636+00	2026-09-20 20:29:57.302636+00	\N	f	\N	\N
7b44581c-5033-4181-b336-4e2b20d9636f	\N	\N	تائر كرديال ياباني	تائر كرديال ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	10500.00	11000.00	0.000	1.000	f	t	2026-09-20 20:36:52.706836+00	2026-09-20 20:36:52.706836+00	\N	f	\N	\N
e7134cfd-69b2-4a0a-aa3f-880b396de336	\N	\N	طبلون ياباني 125	طبلون ياباني 125	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	7800.00	8000.00	0.000	1.000	f	t	2026-09-20 23:26:03.710812+00	2026-09-20 23:26:03.710812+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
2ba0d702-dc5a-4cd2-a52b-4a90f0cec736	\N	\N	علامة اميال ياباني	علامة اميال ياباني	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	1400.00	1500.00	0.000	1.000	f	t	2026-09-20 23:30:26.725472+00	2026-09-20 23:30:26.725472+00	\N	f	\N	\N
f81a2a25-a580-4add-a240-60e90d13b4c6	\N	\N	اذان كشافه ياباني	اذان كشافه ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	2400.00	2500.00	0.000	1.000	f	t	2026-09-19 07:42:14.659687+00	2026-09-20 23:31:15.600147+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
d9199798-c0a8-4a31-8f68-d117a3e6ae4f	\N	\N	زيت الصقر	زيت الصقر	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	f9dee7cf-1165-43cc-a965-9771e88be3a1	3bb255df-3c02-4951-b537-cce8881e3004	2100.00	2200.00	0.000	1.000	f	t	2026-09-20 14:51:41.399355+00	2026-09-20 23:31:55.081672+00	\N	f	\N	\N
357bbcd8-aad8-4310-a076-15742083bef3	\N	\N	اسطب ياباني 125	اسطب ياباني 125	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	1450.00	1500.00	0.000	1.000	f	t	2026-09-20 23:34:02.628854+00	2026-09-20 23:34:02.628854+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
2e0d25da-8464-473c-a2ee-bf11cf9578e3	\N	\N	جمجمه ونيكل	جمجمه ونيكل	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	1950.00	2000.00	0.000	1.000	f	t	2026-09-20 23:36:19.540526+00	2026-09-20 23:36:19.540526+00	\N	f	\N	\N
a3a57d93-f8d3-4684-b12d-fba192bed3e5	\N	\N	اسطب ورا كامل	اسطب ورا كامل	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	3400.00	3500.00	0.000	1.000	f	t	2026-09-20 23:44:53.168106+00	2026-09-20 23:44:53.168106+00	\N	f	\N	\N
e0fb09fc-c273-4d58-9423-87d353d807d1	\N	\N	بيرنج 6301 SDM	بيرنج 6301 SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-20 23:58:36.094126+00	2026-09-20 23:58:36.094126+00	\N	f	\N	\N
4edd2a9a-bb4f-421a-a024-08b9ac789032	\N	\N	عوامه كلبيتر  X100	عوامه كلبيتر  X100	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-21 00:41:19.886809+00	2026-09-21 00:41:19.886809+00	\N	f	\N	\N
cb9d476f-c9f0-448e-b6bd-33ee062585d7	\N	\N	SMZ	اي ام زد	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	7000.00	7500.00	0.000	1.000	f	t	2026-09-21 00:49:16.418498+00	2026-09-21 00:49:16.418498+00	\N	f	\N	\N
726f273b-fdf2-467d-abf3-8f71d714933b	\N	\N	بستون ورنجات صيني 150 كره حراري	بستون ورنجات صيني 150 كره حراري	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	a73fcf68-3e04-4de8-83b1-b7cb19211437	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	3400.00	3500.00	0.000	1.000	f	t	2026-09-21 00:53:02.117359+00	2026-09-21 00:53:02.117359+00	\N	f	\N	\N
1a1f5209-6c9b-447e-a3f6-79262f62be61	\N	\N	فيبرات وصحون JW	فيبرات وصحون  150 JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	4900.00	5000.00	0.000	1.000	f	t	2026-09-21 00:51:23.802392+00	2026-09-21 13:01:25.7661+00	\N	f	\N	\N
3cb56b14-6ea0-493f-a7dc-681134db5917	\N	\N	كليبات كشافه	كليبات كشافه	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	40.00	50.00	0.000	1.000	f	t	2026-09-20 19:29:50.031861+00	2026-09-22 12:30:10.098276+00	\N	f	\N	\N
aaa13363-f4a7-4e83-a5d1-673b670324d7	\N	\N	باكن سلندر تحت	باكن سلندر تحت صيني 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	190.00	200.00	0.000	1.000	f	t	2026-09-21 00:53:58.922611+00	2026-09-21 00:54:57.718096+00	\N	f	\N	\N
f1c8f589-b86a-41b6-be13-023b0748c644	\N	\N	باكن يسار صيني 150	باكن يسار صيني 150	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	290.00	300.00	0.000	1.000	f	t	2026-09-21 00:55:35.336321+00	2026-09-21 00:55:35.336321+00	\N	f	\N	\N
935c8c9b-bd0c-4a18-9cc4-605c4892bebd	\N	\N	باكن صيني يمين	باكن صيني يمين	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	290.00	300.00	0.000	1.000	f	t	2026-09-21 00:54:42.196634+00	2026-09-21 00:56:02.104526+00	\N	f	\N	\N
b031b84c-6601-4c0f-8097-1baef1482013	\N	\N	ربلات والات صيني	ربلات والات صيني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-21 00:56:47.975481+00	2026-09-21 00:56:47.975481+00	\N	f	\N	\N
232bb42d-f0e8-4580-bd69-5c55cf44c1f6	\N	\N	هون سياره باكت اصفر	هون سياره باكت اصفر	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-21 12:33:01.003428+00	2026-09-21 12:33:01.003428+00	\N	f	\N	\N
699467ab-d1a2-47ee-a323-3acd358bf9ec	\N	\N	سماعه حالين لون ازرق	سماعه حالين لون ازرق	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	0.00	0.00	0.000	1.000	f	t	2026-09-21 12:37:06.631559+00	2026-09-21 12:37:06.631559+00	\N	f	\N	\N
8ae27e8e-5127-4a8f-81ed-ce641f393c66	\N	\N	بستون ورنجات X100 +	بستون ورنجات X100 +	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	fbc0f908-9a27-4af9-bd59-f4415b45e302	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-21 12:43:10.314544+00	2026-09-21 12:43:10.314544+00	\N	f	\N	\N
159cef6c-5783-4450-b9f4-536b15395656	\N	\N	بستون ورنجات خراطه 50 X100	بستون ورنجات خراطه 50 X100	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	fbc0f908-9a27-4af9-bd59-f4415b45e302	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-21 12:44:38.989573+00	2026-09-21 12:44:38.989573+00	\N	f	\N	\N
fc0a6282-8c97-4083-b088-498ba5e51ac7	\N	\N	بستون ورنجات متر دب خراطه 25	بستون ورنجات متر دب خراطه 25	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-21 12:46:02.335093+00	2026-09-21 12:46:02.335093+00	\N	f	\N	\N
5c4d5b48-b23e-41c2-b354-68e508d70a88	\N	\N	بستون ونجات كره حراري 200 صيني	بستون ونجات كره حراري 200 صيني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	a73fcf68-3e04-4de8-83b1-b7cb19211437	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-21 12:48:22.087666+00	2026-09-21 12:48:22.087666+00	\N	f	\N	\N
b81fec7b-f1ff-4bb0-8f82-6b0c9b3a0023	\N	\N	بستون ورنجات سانيا ABH 460	بستون ورنجات سانيا ABH 460	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-21 12:50:05.089483+00	2026-09-21 12:50:05.089483+00	\N	f	\N	\N
1ff6cb61-a52e-4a5e-b41a-ea2fa0c56f96	\N	\N	صحون سكان JW	صحون سكان JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-21 12:57:26.848872+00	2026-09-21 12:57:26.848872+00	\N	f	\N	\N
23215db4-e4a9-4299-a378-735c0e080acd	\N	\N	صحون سكان ياباني	صحون سكان ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-21 12:58:47.328005+00	2026-09-21 12:58:47.328005+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
b2511f74-ecc2-484a-9c1e-a955efce05b9	\N	\N	فيبرات وصحون 200 JW	فيبرات وصحون 200 JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	4900.00	5000.00	0.000	1.000	f	t	2026-09-21 13:03:54.909252+00	2026-09-21 13:03:54.909252+00	\N	f	\N	\N
c5c49f7a-da74-4de1-b31e-f065f37f7890	\N	\N	فيبرات وصحون سانيا 200-46 JW	فيبرات وصحون سانيا 200-46 JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-21 13:12:54.701776+00	2026-09-21 13:12:54.701776+00	\N	f	\N	\N
b04b7f08-0b64-4552-821b-c3001daa6153	\N	\N	دعسات OK	دعسات OK	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	220.00	250.00	0.000	1.000	f	t	2026-09-21 14:15:22.68229+00	2026-09-21 14:15:22.68229+00	\N	f	\N	\N
f59d9d20-1a3a-4486-b831-29b46ab327a4	\N	\N	دعست اسبيت صباع JW	دعست اسبيت صباع JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-21 14:23:18.28318+00	2026-09-21 14:23:18.28318+00	\N	f	\N	\N
1308cb1e-cc8c-4a85-ab6a-92ccf53883a3	\N	\N	مسمار طويل عادي	مسمار طويل عادي	\N	\N	e1a61575-7a44-4f6f-8c5f-d50a38d21398	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	90.00	100.00	0.000	1.000	f	t	2026-09-21 14:45:14.601148+00	2026-09-21 14:45:14.601148+00	\N	f	\N	\N
661bdc39-9def-4ddd-96af-0d6d91d8af0e	\N	\N	زجاجات اسطبات	زجاجات اسطبات	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	90.00	100.00	0.000	1.000	f	t	2026-09-21 17:47:08.426764+00	2026-09-21 17:47:08.426764+00	\N	f	\N	\N
1120add1-20c6-4ae5-a729-5c716708488f	\N	\N	طقم جيرات وسنسله ياباني ابو ربلهSDM	طقم جيرات وسنسله ياباني  ابو ربلهSDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	6400.00	6500.00	0.000	1.000	f	t	2026-09-21 17:41:29.052584+00	2026-09-21 17:48:04.412523+00	\N	f	\N	\N
1ca11cda-7ca7-46b4-9c9d-85bcb6bbfb58	\N	\N	عضمه كلبيتر ياباني	عضمه كلبيتر ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-21 18:00:37.428884+00	2026-09-21 18:00:37.428884+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
fb1df70f-6f73-40fe-89fa-bea2be5c2d87	\N	\N	ربلات طاوه  SDM	ربلات طاوه  SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-21 18:02:58.829679+00	2026-09-21 18:02:58.829679+00	\N	f	\N	\N
39b92f0d-f8c4-418c-a0ec-325a23be3970	\N	\N	صفاية بترول	صفاية بترول	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	90.00	100.00	0.000	1.000	f	t	2026-09-21 18:06:13.922336+00	2026-09-21 18:06:13.922336+00	\N	f	\N	\N
5738a4b5-aa2e-4325-b60b-d6d980dbc1fc	\N	\N	كور ياباني ازرق 125 هوايه	كور ياباني ازرق 125 هوايه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1200.00	1250.00	0.000	1.000	f	t	2026-09-19 14:53:16.564517+00	2026-09-21 18:11:29.965758+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
95be6ea9-d2a1-4dbc-bd6d-a9bac27ca332	\N	\N	كور ياباني ازرق 125 بطاريه	كور ياباني ازرق 125 بطاريه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1200.00	1250.00	0.000	1.000	f	t	2026-09-19 14:52:36.197258+00	2026-09-21 18:12:07.420689+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
28e27bd6-fa77-4fa4-b03e-e76abed1e884	\N	\N	لمبه اسطب ورا غماز احمر	لمبه اسطب ورا غماز احمر	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-21 18:16:59.365959+00	2026-09-21 18:16:59.365959+00	\N	f	\N	\N
3ffdfd69-4efd-43cb-9a13-ed72990890b2	\N	\N	ربلات كورات طقم	ربلات كورات طقم	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	270.00	300.00	0.000	1.000	f	t	2026-09-21 18:18:30.938942+00	2026-09-21 18:18:30.938942+00	\N	f	\N	\N
88b84530-e118-48a2-b54b-c60684c7b68d	\N	\N	حزام مخده	حزام مخده	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-21 18:23:59.068332+00	2026-09-21 18:23:59.068332+00	\N	f	\N	\N
4333bfd6-0bd3-44cb-8eca-01c380e70a09	\N	\N	ربلت هوايه ياباني 125	ربلت هوايه ياباني 125	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-21 19:57:19.161979+00	2026-09-21 19:57:32.748491+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
8bc6d325-eead-424a-8e56-117a0adc2427	\N	\N	كعك اميال	كعك اميال	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	190.00	200.00	0.000	1.000	f	t	2026-09-21 20:01:07.810667+00	2026-09-21 20:01:07.810667+00	\N	f	\N	\N
69adae6f-2b51-43ec-9329-ce2f65660eaf	\N	\N	بنكات صيني قدام	بنكات صيني قدام	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	3400.00	3500.00	0.000	1.000	f	t	2026-09-21 20:03:51.581594+00	2026-09-21 20:03:51.581594+00	\N	f	\N	\N
5879e2ce-ab29-4fe2-bac1-e2d4d887f845	\N	\N	تعبيره JW	تعبيره JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	4900.00	5000.00	0.000	1.000	f	t	2026-09-21 20:08:52.834196+00	2026-09-21 20:08:52.834196+00	\N	f	\N	\N
cc92d23e-c4c1-4e76-8c4c-419501d4dc11	\N	\N	اصلاح كلبيتر صيني	اصلاح كلبيتر صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	900.00	1000.00	0.000	1.000	f	t	2026-09-21 20:13:28.295074+00	2026-09-21 20:13:28.295074+00	\N	f	\N	\N
8d82cbd4-6995-46f4-9591-7968c4a572d4	\N	\N	ربلات سقمه كبير	ربلات سقمه كبير	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	90.00	100.00	0.000	1.000	f	t	2026-09-21 20:16:02.558941+00	2026-09-21 20:16:02.558941+00	\N	f	\N	\N
950566db-7963-4bf2-a6b3-dd646cbe711a	\N	\N	ربلات اذان	ربلات اذان	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	100.00	125.00	0.000	1.000	f	t	2026-09-21 20:21:36.186068+00	2026-09-21 20:21:36.186068+00	\N	f	\N	\N
2dc1b790-5ffc-4d20-9372-3bdbf3d7b663	\N	\N	نص عضمه كلبيتر صيني 150 رزق اكس ثري	نص عضمه كلبيتر صيني 150 رزق اكس ثري	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	450.00	500.00	0.000	1.000	f	t	2026-09-21 20:24:42.665089+00	2026-09-21 20:24:42.665089+00	\N	f	\N	\N
c91854e6-9439-406a-8012-8cad4f8282d8	\N	\N	عضمه كلبيتر كامله صيني 150	عضمه كلبيتر كامله صيني 150	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-21 20:26:58.786982+00	2026-09-21 20:26:58.786982+00	\N	f	\N	\N
9a33c016-39c3-459b-abb4-86e89ca804b8	\N	\N	سماعه حالن لون اسود باكت ابيض	سماعه حالن لون اسود باكت ابيض	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1000.00	1500.00	0.000	1.000	f	t	2026-09-21 12:37:53.010705+00	2026-09-24 16:32:06.41242+00	\N	f	\N	\N
47a0c003-5d56-4e9a-a09b-e9fba536d726	\N	\N	مغطي كور زيت	مغطي كور زيت	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-21 20:29:04.022003+00	2026-09-21 20:29:04.022003+00	\N	f	\N	\N
8e1d8b38-b87b-4950-bba2-be1e4c8ad70e	\N	\N	مغطي شبك زيت صيني	مغطي شبك زيت صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-21 20:31:51.002703+00	2026-09-21 20:31:51.002703+00	\N	f	\N	\N
d34e2069-15cb-473d-a93f-60e931b4c622	\N	\N	ربلات بنكه	ربلات بنكه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	180.00	200.00	0.000	1.000	f	t	2026-09-21 20:41:41.323234+00	2026-09-21 20:42:01.069264+00	\N	f	\N	\N
2f57de48-5426-4618-9b0a-a87fb9b00b0d	\N	\N	كنشات فحمات	كنشات فحمات	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	270.00	300.00	0.000	1.000	f	t	2026-09-21 20:44:08.304293+00	2026-09-21 20:44:08.304293+00	\N	f	\N	\N
b57ba094-928d-4eca-97fa-b3863ab7ba8e	\N	\N	اصلاح بريك SDM	اصلاح بريك SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	450.00	500.00	0.000	1.000	f	t	2026-09-21 20:45:44.611147+00	2026-09-21 20:45:44.611147+00	\N	f	\N	\N
8f42e5fd-7676-4f6b-bbf3-346fbf6b25fa	\N	\N	اصلاح كلبيتر X100	اصلاح كلبيتر X100	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	1450.00	1500.00	0.000	1.000	f	t	2026-09-21 20:54:26.987224+00	2026-09-21 20:54:26.987224+00	\N	f	\N	\N
8f38bd22-1abf-4689-b78b-13ba2703b0ad	\N	\N	جير ورا معا السنسله  X100	جير ورا معا السنسله  X100	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	3900.00	4000.00	0.000	1.000	f	t	2026-09-21 22:52:41.418091+00	2026-09-21 22:52:41.418091+00	\N	f	\N	\N
126163e3-d64d-4473-bea2-2e8e8aec129a	\N	\N	اسطب X100 عادي	اسطب X100 عادي	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	650.00	700.00	0.000	1.000	f	t	2026-09-21 22:54:47.336989+00	2026-09-21 22:54:47.336989+00	\N	f	\N	\N
08392996-e913-4f1f-9518-ba1a17b274af	\N	\N	ربلات طاوه خلف X100	ربلات طاوه خلف X100	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-21 23:05:20.570934+00	2026-09-21 23:05:20.570934+00	\N	f	\N	\N
c83448c4-85bb-4d60-bd71-ba86fe643d10	\N	\N	لسقه كهرب سوداء	لسقه كهرب سوداء	\N	\N	\N	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	180.00	200.00	0.000	1.000	f	t	2026-09-22 11:07:12.392164+00	2026-09-22 11:07:12.392164+00	\N	f	\N	\N
ead6e7a8-0fde-4717-bd4b-65fa0f59a35c	\N	\N	سقمه معا المسامير ABH 212	سقمه معا المسامير ABH 212	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	1100.00	1200.00	0.000	1.000	f	t	2026-09-22 13:30:56.225016+00	2026-09-22 13:30:56.225016+00	\N	f	\N	\N
050d2592-c49a-47fc-a43f-810632c9dac9	\N	\N	طبله كلبيتر  ياباني وكاله	طبله كلبيتر  ياباني وكاله	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1200.00	1500.00	0.000	1.000	f	t	2026-09-22 16:08:34.88592+00	2026-09-22 16:08:34.88592+00	\N	f	\N	\N
a067aa3b-ed5c-421f-ad43-992b8daf5af2	\N	\N	لمدت كلتش ياباني	لمدت كلتش ياباني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	350.00	400.00	0.000	1.000	f	t	2026-09-22 16:40:08.368752+00	2026-09-22 16:40:08.368752+00	\N	f	\N	\N
c156a116-eef2-4a47-94dc-00b514f7b9a2	\N	\N	اسطب بومه غماز	اسطب بومه غماز	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1400.00	1500.00	0.000	1.000	f	t	2026-09-22 18:15:57.621788+00	2026-09-22 18:15:57.621788+00	\N	f	\N	\N
68530644-1472-4fa9-84c0-e82aa848ff0c	\N	\N	زجاجه اسطب ورا  SDM	زجاجه اسطب ورا  SDM	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-22 18:19:42.999582+00	2026-09-22 18:19:42.999582+00	\N	f	\N	\N
b1e6e367-f6c6-4bb4-af2f-f7a71245c5a9	\N	\N	زجاجه اسطب ورا دوزك	زجاجه اسطب ورا دوزك	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-22 18:21:14.981978+00	2026-09-22 18:21:14.981978+00	\N	f	\N	\N
4be22fbe-0616-45ff-8dae-103a8d7613e8	\N	\N	قاعده اسطب ورا	قاعده اسطب ورا	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	950.00	1000.00	0.000	1.000	f	t	2026-09-22 18:24:38.59938+00	2026-09-22 18:24:38.59938+00	\N	f	\N	\N
7a7f8655-57b8-48c1-98aa-04830d324e0b	\N	\N	كشافه اضافي ابو اثنين جلب	كشافه اضافي ابو اثنين جلب	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1150.00	1200.00	0.000	1.000	f	t	2026-09-22 18:26:51.060251+00	2026-09-22 18:26:51.060251+00	\N	f	\N	\N
7e0efeb0-8264-4598-9ff4-644124b6b55a	\N	\N	غراء مخلوط باكت ازرق	غراء مخلوط باكت ازرق	\N	\N	\N	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	450.00	500.00	0.000	1.000	f	t	2026-09-22 18:29:12.175003+00	2026-09-22 18:29:12.175003+00	\N	f	\N	\N
6b9db4f0-57cf-4502-a410-8461c9aed3f5	\N	\N	غراء مخلوط باكت احمر	غراء مخلوط باكت احمر	\N	\N	\N	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	450.00	500.00	0.000	1.000	f	t	2026-09-22 18:30:56.093192+00	2026-09-22 18:30:56.093192+00	\N	f	\N	\N
159eb1bb-920d-4fac-9751-6c15800a187b	\N	\N	ربلت هوايه صيني	ربلت هوايه صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-22 18:34:48.682666+00	2026-09-22 18:34:48.682666+00	\N	f	\N	\N
58f54eda-098e-4e7d-a867-7d8a425b18dd	\N	\N	لي مبرد صيني	لي مبرد صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-22 18:35:32.230147+00	2026-09-22 18:35:32.230147+00	\N	f	\N	\N
9e60ec82-1c0b-4838-809c-177e75e48dee	\N	\N	زجاجه كشافه صيني	زجاجه كشافه صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-22 18:51:38.481985+00	2026-09-22 18:51:38.481985+00	\N	f	\N	\N
61f0cab6-4cf4-4276-a31b-ff5ec62a7420	\N	\N	زجاجه كشافه X100	زجاجه كشافه X100	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-22 18:54:46.44061+00	2026-09-22 18:54:46.44061+00	\N	f	\N	\N
e0f400b1-a39e-40cf-a404-72e31c439db9	\N	\N	عدسه زيت SDM	عدسه زيت SDM	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-22 18:55:38.552802+00	2026-09-22 18:55:38.552802+00	\N	f	\N	\N
7928527c-6a32-4920-860f-e573a3dc5f18	\N	\N	لي مبرد صيني JW	لي مبرد صيني JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-22 18:57:21.629153+00	2026-09-22 18:57:21.629153+00	\N	f	\N	\N
6b97b2f4-dac6-4e92-bd5a-a01ea8b73b13	\N	\N	طقم سناره كلتش صيني CG125. JW	طقم سناره كلتش صيني CG125. JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	800.00	1000.00	0.000	1.000	f	t	2026-09-22 19:18:17.376364+00	2026-09-22 19:18:17.376364+00	\N	f	\N	\N
ccc3e220-3d0f-4d3a-b4fa-7ed0fc4acbfc	\N	\N	سناره كلتش صيني لحاله CG150. JW	سناره كلتش صيني لحاله CG150. JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	600.00	800.00	0.000	1.000	f	t	2026-09-22 19:21:35.344911+00	2026-09-22 19:21:35.344911+00	\N	f	\N	\N
42f9e0c1-bf46-45a8-be43-d71e4204fc97	\N	\N	طقم سناره كلتش صيني CG150. JW	طقم سناره كلتش صيني CG150. JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	f752c58a-c54b-44a9-bf11-7b9b9d920cec	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	800.00	1000.00	0.000	1.000	f	t	2026-09-22 19:25:21.611511+00	2026-09-22 19:25:21.611511+00	\N	f	\N	\N
2dce84a6-e616-4e17-916c-7cff9d3b2790	\N	\N	سلك احمر	سلك احمر	\N	\N	ff24be09-8a9d-4800-9866-8fa71bc2e589	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	270.00	300.00	0.000	1.000	f	t	2026-09-22 19:29:07.803356+00	2026-09-22 19:29:07.803356+00	\N	f	\N	\N
e86a0a0b-aae9-40e3-bf87-d93526424c0d	\N	\N	سلك اسود	سلك اسود	\N	\N	ff24be09-8a9d-4800-9866-8fa71bc2e589	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	170.00	200.00	0.000	1.000	f	t	2026-09-22 19:29:50.756018+00	2026-09-22 19:29:50.756018+00	\N	f	\N	\N
b0ad0530-d55d-477e-bd58-6d54b6e70039	\N	\N	نيكل كشافه	نيكل كشافه	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-22 19:30:43.201828+00	2026-09-22 19:30:43.201828+00	\N	f	\N	\N
964387a5-0a14-450d-bcbf-a251477f441d	\N	\N	جمجمه	جمجمه	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-22 19:31:24.627451+00	2026-09-22 19:31:24.627451+00	\N	f	\N	\N
0189bc7e-b550-4348-867a-1ef3076e4d88	\N	\N	كشافه 12 عين ابيض	كشافه 12 عين ابيض	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1400.00	1500.00	0.000	1.000	f	t	2026-09-22 19:44:25.887426+00	2026-09-22 19:44:25.887426+00	\N	f	\N	\N
c806810f-3e1e-457d-9185-4ce688e8c24c	\N	\N	ضفيره ياباني	ضفيره ياباني	\N	\N	ff24be09-8a9d-4800-9866-8fa71bc2e589	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	5900.00	6000.00	0.000	1.000	f	t	2026-09-22 19:45:23.436762+00	2026-09-22 19:45:23.436762+00	\N	f	\N	\N
c34f9e18-82d3-4199-a39a-44c6c104d997	\N	\N	ضفيره صيني	ضفيره صيني	\N	\N	ff24be09-8a9d-4800-9866-8fa71bc2e589	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	4400.00	4500.00	0.000	1.000	f	t	2026-09-22 19:46:31.040382+00	2026-09-22 19:46:31.040382+00	\N	f	\N	\N
afe826ee-744f-49d8-ab42-1e8ad34dda26	\N	\N	مسامير اسطب ورا	مسامير اسطب ورا	\N	\N	e1a61575-7a44-4f6f-8c5f-d50a38d21398	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	40.00	50.00	0.000	1.000	f	t	2026-09-22 20:02:21.050057+00	2026-09-22 20:02:21.050057+00	\N	f	\N	\N
02ec7152-406f-4ff1-bbfc-24db0fc1cd3c	\N	\N	نص ونكر كلتش  JW	نص ونكر كلتش  JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	500.00	700.00	0.000	1.000	f	t	2026-09-22 20:48:07.079015+00	2026-09-22 20:48:07.079015+00	\N	f	\N	\N
5073322c-80d1-4ddd-8f49-af66a9d03e80	\N	\N	قعادت اسطب ورا معا بيت الجلب	قعادت اسطب ورا معا بيت الجلب	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	900.00	1000.00	0.000	1.000	f	t	2026-09-22 22:14:07.774418+00	2026-09-22 22:14:07.774418+00	\N	f	\N	\N
0194a362-4c41-4ab4-90a0-1b863931747e	\N	\N	اسطب صيني	اسطب صيني	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-22 22:18:52.041903+00	2026-09-22 22:18:52.041903+00	\N	f	\N	\N
09d0d848-423d-426a-98a7-2c95e4738540	\N	\N	فحمات SMZ	فحمات SMZ	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	450.00	500.00	0.000	1.000	f	t	2026-09-22 22:25:32.548633+00	2026-09-22 22:25:32.548633+00	\N	f	\N	\N
df1b6c5e-f8e7-4994-8860-d8cc66b6a761	\N	\N	فحمات SDM	فحمات SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-22 22:26:14.523932+00	2026-09-22 22:26:29.157809+00	\N	f	\N	\N
97fe00b9-956c-42c0-b0c8-b04481cb9665	\N	\N	فحمات 2بستون HZ	فحمات 2بستون HZ	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	\N	450.00	500.00	0.000	1.000	f	t	2026-09-22 22:28:00.574528+00	2026-09-22 22:28:00.574528+00	\N	f	\N	\N
4af0ad25-987f-4628-ac91-13467f10238c	\N	\N	فحمات 2 بستون ABH	فحمات 2 بستون ABH	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-22 22:28:53.792383+00	2026-09-22 22:28:53.792383+00	\N	f	\N	\N
1e709de5-eaa9-4218-b382-55fd7beb11b0	\N	\N	بستون ورنجات ياباني SDM	بستون ورنجات ياباني SDM	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	74871a9d-135c-4554-8d4a-d15ddaf85843	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	3900.00	4000.00	0.000	1.000	f	t	2026-09-23 14:43:31.310914+00	2026-09-23 14:43:31.310914+00	\N	f	\N	\N
7a4bc7d1-1701-44dd-9297-8e0bbd04c19e	\N	\N	وصلت بريك ياباني	وصلت بريك ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-23 16:07:12.963929+00	2026-09-23 16:07:12.963929+00	\N	f	\N	\N
27388e7b-ef84-410f-befb-6acae107712b	\N	\N	جلبات طبلون بحري	جلبات طبلون بحري	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	270.00	300.00	0.000	1.000	f	t	2026-09-23 16:08:15.804166+00	2026-09-23 16:08:15.804166+00	\N	f	\N	\N
a2f663c6-b362-41e7-ab30-9144d30a33b9	\N	\N	طبلون سانيا	طبلون سانيا	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	5500.00	6000.00	0.000	1.000	f	t	2026-09-23 16:09:13.929125+00	2026-09-23 16:09:13.929125+00	\N	f	\N	\N
3425d17f-c9de-42a3-81e7-081005b4bec7	\N	\N	وصلت بريك صيني SDM	وصلت بريك صيني SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	800.00	0.000	1.000	f	t	2026-09-23 16:10:27.568962+00	2026-09-23 16:10:27.568962+00	\N	f	\N	\N
d27977cd-6e65-4b53-89ab-8b4080cc4738	\N	\N	كته ارقام سانيا  JW	كته ارقام سانيا  JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	1400.00	1500.00	0.000	1.000	f	t	2026-09-23 16:19:11.76601+00	2026-09-23 16:19:11.76601+00	\N	f	\N	\N
6391a825-1fa2-4d49-8c77-b2110d7358cd	\N	\N	كته ارقام صيني  SDM	كته ارقام صيني  SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-23 16:20:32.897164+00	2026-09-23 16:20:32.897164+00	\N	f	\N	\N
45f3b222-44eb-46d4-af59-39a758dae237	\N	\N	بيت جلب ورا  JW	بيت جلب ورا  JW	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	650.00	700.00	0.000	1.000	f	t	2026-09-23 16:22:11.75439+00	2026-09-23 16:22:11.75439+00	\N	f	\N	\N
6ecccb78-add2-4de3-a137-d6798505ac49	\N	\N	علامه اميال صيني	علامه اميال صيني	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-23 16:23:27.292005+00	2026-09-23 16:23:27.292005+00	\N	f	\N	\N
341d5503-de65-4b36-96d6-7e18b0d72e20	\N	\N	صحون كره حراري	صحون سكان كره حراري	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	a73fcf68-3e04-4de8-83b1-b7cb19211437	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	1400.00	1500.00	0.000	1.000	f	t	2026-09-21 12:55:29.686047+00	2026-09-23 16:34:18.694448+00	\N	f	\N	\N
4207f0a5-a4d4-4989-921b-5a68b445b0d1	\N	\N	شحم	شحم	\N	\N	89117623-60c3-4138-8cd7-38a45387b8db	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	180.00	200.00	0.000	1.000	f	t	2026-09-23 16:35:29.785223+00	2026-09-23 16:35:29.785223+00	\N	f	\N	\N
bec3baa6-b867-4560-97a8-3c800e2fdf98	\N	\N	رنجات ياباني	رنجات ياباني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	74871a9d-135c-4554-8d4a-d15ddaf85843	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	1900.00	2000.00	0.000	1.000	f	t	2026-09-23 16:41:24.166608+00	2026-09-23 16:41:24.166608+00	\N	f	\N	\N
79ce9af2-7485-4824-869f-2d318f916878	\N	\N	ربلات والات ياباني	ربلات والات ياباني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	450.00	500.00	0.000	1.000	f	t	2026-09-23 16:46:19.269186+00	2026-09-23 16:46:19.269186+00	\N	f	\N	927b49ac-f186-42a5-8612-c3fa3f2958b7
cecc9d0f-4342-4591-8553-dbaffe71b588	\N	\N	باكن سلندر تحت ياباني	باكن سلندر تحت ياباني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-23 16:49:05.474514+00	2026-09-23 16:49:05.474514+00	\N	f	\N	\N
7e0feeb6-93dd-4d00-beb1-0199132416dd	\N	\N	مغطي سنسله ياباني	مغطي سنسله ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	1900.00	2000.00	0.000	1.000	f	t	2026-09-24 11:37:37.302382+00	2026-09-24 11:37:37.302382+00	\N	f	\N	\N
8cb87967-d5be-427d-bc84-ecce76d8b40b	\N	\N	شبات سهوم تانكي	شبات سهوم تانكي	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1400.00	1500.00	0.000	1.000	f	t	2026-09-24 11:40:55.150168+00	2026-09-24 11:40:55.150168+00	\N	f	\N	\N
263abe41-7352-4f1b-84e5-7f01a812657c	\N	\N	اسطب ورا من الجديد	اسطب ورا من الجديد	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	3900.00	4000.00	0.000	1.000	f	t	2026-09-24 11:56:37.619341+00	2026-09-24 11:56:37.619341+00	\N	f	\N	\N
7d5eb3e7-707f-4380-84ec-45257dd439fb	\N	\N	كته بريك ورا	كته بريك ورا	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-24 12:01:56.873728+00	2026-09-24 12:01:56.873728+00	\N	f	\N	\N
31b3e4fe-3b75-47a1-9a3c-a7ab4760a7c9	\N	\N	اذان X100 اسود	اذان X100 اسود	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	3400.00	3500.00	0.000	1.000	f	t	2026-09-24 12:02:53.432963+00	2026-09-24 12:02:53.432963+00	\N	f	\N	\N
8ac97183-bd50-4b64-a6dd-8ff577a8042d	\N	\N	حدائد زينه	حدائد زينه	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-24 12:03:40.194557+00	2026-09-24 12:03:40.194557+00	\N	f	\N	\N
ba77826c-7a1e-457e-b178-0ee046f5eb15	\N	\N	لمبه زينه اصفر	لمبه زينه اصفر	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	90.00	100.00	0.000	1.000	f	t	2026-09-24 12:06:38.251379+00	2026-09-24 12:06:38.251379+00	\N	f	\N	\N
e7f288f4-7e80-4edb-b5c2-a65662a27340	\N	\N	لمبه زينه اخضر	لمبه زينه اخضر	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	90.00	100.00	0.000	1.000	f	t	2026-09-24 12:07:30.090732+00	2026-09-24 12:07:30.090732+00	\N	f	\N	\N
a1a3fde4-5ef8-4fe5-8111-9ba9fe82bbf1	\N	\N	قعاده بطاريه JW عادي	قعاده بطاريه JW عادي	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-24 12:08:30.732706+00	2026-09-24 12:08:30.732706+00	\N	f	\N	\N
af569f77-8680-4d22-a686-93f851b08ee8	\N	\N	خبطه ليور صيني RZ	خبطه ليور صيني RZ	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	650.00	700.00	0.000	1.000	f	t	2026-09-24 12:10:39.52481+00	2026-09-24 12:10:39.52481+00	\N	f	\N	\N
0ded29e4-ea57-415c-a933-bf02c6d492a9	\N	\N	خبطه سرعه SDM	خبطه سرعه SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	\N	450.00	700.00	0.000	1.000	f	t	2026-09-24 12:12:09.99909+00	2026-09-24 12:12:09.99909+00	\N	f	\N	\N
4ba7afa5-3784-45b4-8ad3-ef8dae4f085d	\N	\N	خبطه ليور ياباني GS	خبطه ليور ياباني GS	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	600.00	700.00	0.000	1.000	f	t	2026-09-24 12:56:35.502121+00	2026-09-24 12:56:35.502121+00	\N	f	\N	\N
dcedf7e6-62a7-47bd-8d16-f6bc909e746a	\N	\N	بيم عصافير والات ياباني	بيم عصافير والات ياباني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-24 12:58:37.273386+00	2026-09-24 12:58:37.273386+00	\N	f	\N	\N
3b8d031a-0f83-4775-824e-17aa0fa276d0	\N	\N	لمده كلتش ياباني	لمده كلتش ياباني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	350.00	400.00	0.000	1.000	f	t	2026-09-24 12:59:57.741728+00	2026-09-24 12:59:57.741728+00	\N	f	\N	\N
46af6a39-fef3-4fa6-92d6-b7d51ad09bd9	\N	\N	مغطي كور مكينه	مغطي كور مكينه	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-24 13:00:50.817302+00	2026-09-24 13:00:50.817302+00	\N	f	\N	\N
849ead55-f26e-48f0-8e11-efb9be56eea2	\N	\N	تانكي شعره معا كورات صيني	تانكي شعره معا كورات صيني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	7900.00	8000.00	0.000	1.000	f	t	2026-09-24 13:06:49.054489+00	2026-09-24 13:06:49.054489+00	\N	f	\N	\N
22c1908e-f7a5-42be-9619-60a2f3f51c57	\N	\N	كته ارقام فوق صيني SDM	كته ارقام فوق صيني SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-24 13:08:37.887146+00	2026-09-24 13:08:37.887146+00	\N	f	\N	\N
c7b09c61-befd-452f-a58e-55d336ebffdc	\N	\N	اسطب X100 غماز وكاله	اسطب X100 غماز وكاله	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-24 13:10:19.842396+00	2026-09-24 13:10:19.842396+00	\N	f	\N	\N
3105ed12-aa8b-4d1e-93ec-66065eaa9a81	\N	\N	اسطب X100 غماز	اسطب X100 غماز	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	fbc0f908-9a27-4af9-bd59-f4415b45e302	493a3111-fed7-4f09-91cb-8388aa4f9e64	600.00	700.00	0.000	1.000	f	t	2026-09-24 13:10:50.366515+00	2026-09-24 13:10:50.366515+00	\N	f	\N	\N
3b27463d-dcfa-460a-9bef-9415cce5f42a	\N	\N	لمبه اسطب ورا غماز ملون	لمبه اسطب ورا غماز ملون	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	270.00	500.00	0.000	1.000	f	t	2026-09-24 19:53:53.97915+00	2026-09-24 19:53:53.97915+00	\N	f	\N	\N
5d505069-0ebe-4dc5-b170-fbbbf02c220a	\N	\N	طقم جيرات مكينه صيني 200 SDM	طقم جيرات مكينه صيني 200 SDM	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	74871a9d-135c-4554-8d4a-d15ddaf85843	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	0.00	0.00	0.000	1.000	f	t	2026-09-24 21:39:30.416509+00	2026-09-25 18:11:01.645798+00	\N	f	\N	\N
23a108fd-1e68-49cc-9b02-48672022fdf5	\N	\N	اسطب ياباني سهم اسود غماز	اسطب ياباني سهم اسود غماز	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1100.00	1200.00	0.000	1.000	f	t	2026-09-25 18:13:04.704932+00	2026-09-25 18:13:04.704932+00	\N	f	\N	\N
b4937e5f-74dc-497a-ac20-2a6b01faba4f	\N	\N	اسطب ياباني نيكل غماز	اسطب ياباني نيكل غماز	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1400.00	1500.00	0.000	1.000	f	t	2026-09-25 18:14:37.999727+00	2026-09-25 18:14:37.999727+00	\N	f	\N	\N
e8c7cd21-01b2-43a8-a710-98dcee444c2c	\N	\N	اسطب ساروخ صيني غماز	اسطب ساروخ صيني غماز	\N	\N	fbf81d00-6cf7-455f-978d-703e16f8b23d	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	700.00	800.00	0.000	1.000	f	t	2026-09-25 18:16:25.004175+00	2026-09-25 18:16:25.004175+00	\N	f	\N	\N
be2bade7-b8d5-43e3-bf9f-7d469fc94e82	\N	\N	بلاك احمر رقم 8	بلاك احمر رقم 8	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-26 11:30:00.135568+00	2026-09-26 11:30:00.135568+00	\N	f	\N	\N
3c707e7f-c6ac-4493-a5ac-1a4b2663ca7d	\N	\N	زجاجه اسطب ورا معا القعاده	زجاجه اسطب ورا معا القعاده	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	\N	1500.00	1700.00	0.000	1.000	f	t	2026-09-28 17:37:19.621856+00	2026-09-28 17:37:19.621856+00	\N	f	\N	\N
c5385f9b-57f1-4f9e-9c58-9458f2f2c541	\N	\N	بلاك احمر رقم 7 طويل	بلاك احمر رقم 7 طويل	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-26 11:32:34.976754+00	2026-09-26 11:32:34.976754+00	\N	f	\N	\N
457a1957-d5bc-4964-b819-f443f79fcbb6	\N	\N	بلاك احمر رقم 7 قصير	بلاك احمر رقم 7 قصير	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-26 11:33:16.914467+00	2026-09-26 11:33:16.914467+00	\N	f	\N	\N
26e8d8d0-32ac-4abb-a5be-46766973051a	\N	\N	صباع كلتش OPPLE	صباع كلتش OPPLE	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	08c5d8cb-2d49-48d9-b0c0-ffb872ba793b	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-26 11:38:08.501664+00	2026-09-26 11:38:08.501664+00	\N	f	\N	\N
fd10f719-0df5-40dd-8f0a-6a1c8de70a36	\N	\N	هندل التمساح	هندل التمساح	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1400.00	1500.00	0.000	1.000	f	t	2026-09-26 12:30:20.54588+00	2026-09-26 12:30:20.54588+00	\N	f	\N	\N
13f5284b-62bc-4297-899c-998cdb330c0d	\N	\N	هندل عربه	هندل عربه	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	\N	1900.00	2000.00	0.000	1.000	f	t	2026-09-26 12:31:59.918422+00	2026-09-26 12:31:59.918422+00	\N	f	\N	\N
24cedfdd-dd19-4347-9091-1e9495e0a4e9	\N	\N	هندل SDM	هندل SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	74871a9d-135c-4554-8d4a-d15ddaf85843	493a3111-fed7-4f09-91cb-8388aa4f9e64	1450.00	1500.00	0.000	1.000	f	t	2026-09-26 12:34:02.115051+00	2026-09-26 12:34:02.115051+00	\N	f	\N	\N
4a32e587-05ab-44fd-86cf-f0375df22c6f	\N	\N	سقمه ABH	سقمه ABH	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	1000.00	1200.00	0.000	1.000	f	t	2026-09-26 13:24:08.255477+00	2026-09-26 13:24:08.255477+00	\N	f	\N	\N
58dcb1ba-bd63-441a-a2a4-95ad38d0870e	\N	\N	فلس كلبيتر ياباني	فلس كلبيتر ياباني	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-26 16:56:33.451632+00	2026-09-26 16:56:33.451632+00	\N	f	\N	\N
9ed1022c-9015-4165-aace-fbd3a371f5b9	\N	\N	طقم اذان كشافه دوزك	طقم اذان كشافه دوزك	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	\N	2300.00	2400.00	0.000	1.000	f	t	2026-09-26 17:00:25.223925+00	2026-09-26 17:00:25.223925+00	\N	f	\N	\N
ec2ae3b7-98b2-4ad8-9b8b-7c6a359144c0	\N	\N	كشافه كامل صيني 12 عين	كشافه كامل صيني 12 عين	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	3400.00	3500.00	0.000	1.000	f	t	2026-09-26 17:02:31.480511+00	2026-09-26 17:02:31.480511+00	\N	f	\N	\N
9922e1aa-c67f-4007-a093-8528fd89e4f1	\N	\N	دعست سواق يمين JW	دعست سواق يمين JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	1200.00	1250.00	0.000	1.000	f	t	2026-09-26 17:13:10.611148+00	2026-09-26 17:13:10.611148+00	\N	f	\N	\N
7a1f6013-5e59-4443-9637-32d425ec1d7b	\N	\N	دعست سواق يسار JW	دعست سواق يسار JW	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	f752c58a-c54b-44a9-bf11-7b9b9d920cec	493a3111-fed7-4f09-91cb-8388aa4f9e64	1200.00	1250.00	0.000	1.000	f	t	2026-09-26 17:14:02.337671+00	2026-09-26 17:14:02.337671+00	\N	f	\N	\N
3e68ec96-b5ed-4d7b-856b-570a51e12463	\N	\N	طبلون صيني كبير باكت اخضر	طبلون صيني كبير باكت اخضر	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	4800.00	5000.00	0.000	1.000	f	t	2026-09-26 20:42:34.384661+00	2026-09-26 20:42:34.384661+00	\N	f	\N	\N
c802adac-afc2-445b-9fdb-b02336c37644	\N	\N	يدت سكان كلتش	يدت سكان كلتش	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	\N	450.00	500.00	0.000	1.000	f	t	2026-09-27 15:13:47.346905+00	2026-09-27 15:13:47.346905+00	\N	f	\N	\N
4bc66865-1f22-4dd0-8cea-375f3088550d	\N	\N	صباع بريك JW	صباع بريك JW	\N	\N	\N	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	500.00	700.00	0.000	1.000	f	t	2026-09-27 15:31:14.60004+00	2026-09-27 15:31:14.60004+00	\N	f	\N	\N
59505547-0983-4b15-92aa-a171a12d329c	\N	\N	ميل ياباني شمال	ميل ياباني شمال	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	9900.00	10000.00	0.000	1.000	f	t	2026-09-27 16:42:59.759579+00	2026-09-27 16:42:59.759579+00	\N	f	\N	\N
6607f1cc-7507-4ae3-a658-7b421cad5ad2	\N	\N	ميل ياباني يمين	ميل ياباني يمين	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	4344c739-fedf-4de6-a9b7-546949c1a69d	493a3111-fed7-4f09-91cb-8388aa4f9e64	9900.00	10000.00	0.000	1.000	f	t	2026-09-27 16:44:05.635256+00	2026-09-27 16:44:05.635256+00	\N	f	\N	\N
8104da92-c9a7-4a6d-a5a3-89d03bfbd93c	\N	\N	ميل شمال صيني رزق اكس ثري	ميل شمال صيني رزق اكس ثري	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	9000.00	9500.00	0.000	1.000	f	t	2026-09-27 16:47:28.749906+00	2026-09-27 16:47:28.749906+00	\N	f	\N	\N
87a70022-2358-43bf-be60-1fc57cbcd68d	\N	\N	ميل ياباني مقلد يسار	ميل ياباني مقلد يسار	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	7000.00	7500.00	0.000	1.000	f	t	2026-09-27 17:08:30.650416+00	2026-09-27 17:08:30.650416+00	\N	f	\N	\N
d0ea5012-f420-479c-8d06-db8394b66e65	\N	\N	ميل ياباني مقلد يمين	ميل ياباني مقلد يمين	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	7000.00	7500.00	0.000	1.000	f	t	2026-09-27 17:09:13.132191+00	2026-09-27 17:09:13.132191+00	\N	f	\N	\N
37b8b5ed-dc2f-416c-a614-df1b6ca4902f	\N	\N	اسبرنج اميال	اسبرنج اميال	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-27 17:13:53.552522+00	2026-09-27 17:13:53.552522+00	\N	f	\N	\N
3ce5cd23-d98f-4ed1-aace-80348866b1b1	\N	\N	اسبرنج اميال كره حراري	اسبرنج اميال كره حراري	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	a73fcf68-3e04-4de8-83b1-b7cb19211437	493a3111-fed7-4f09-91cb-8388aa4f9e64	900.00	1000.00	0.000	1.000	f	t	2026-09-27 17:12:09.008616+00	2026-09-27 17:14:25.035602+00	\N	f	\N	\N
0c97bd4c-2abc-43db-bb30-d91bc3370e7c	\N	\N	ميل صيني شمال	ميل صيني سانيا 46 شمال	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	8000.00	8500.00	0.000	1.000	f	t	2026-09-27 17:26:22.274749+00	2026-09-27 17:33:51.396533+00	\N	f	\N	\N
9fd7f5bf-be1a-45a5-8d4d-e520803d3d5d	\N	\N	ميل سانيا 46 SDM	ميل سانيا 46 SDM	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	\N	8000.00	8500.00	0.000	1.000	f	t	2026-09-27 17:37:18.740591+00	2026-09-27 17:37:18.740591+00	\N	f	\N	\N
aa31fd37-7e24-4c2d-9e48-3c0e4c989db5	\N	\N	بلاك ياباني ثلاث شعرات	بلاك ياباني ثلاث شعرات	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	800.00	1000.00	0.000	1.000	f	t	2026-09-27 19:35:46.108501+00	2026-09-27 19:35:46.108501+00	\N	f	\N	\N
22f584dc-9914-48b1-98d2-2e7890e3fad2	\N	\N	سناره بريك ياباني قصيره	سناره بريك ياباني قصيره	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-28 00:22:01.816731+00	2026-09-28 00:22:01.816731+00	\N	f	\N	\N
9d116d69-0484-41d4-8b27-f169134c764d	\N	\N	غلاف ارقام فاضي	غلاف ارقام فاضي	\N	\N	67e25cfb-fab6-42e9-9c98-6330601eace9	\N	493a3111-fed7-4f09-91cb-8388aa4f9e64	450.00	500.00	0.000	1.000	f	t	2026-09-28 00:23:54.841284+00	2026-09-28 00:23:54.841284+00	\N	f	\N	\N
bd9ec08a-349d-44c6-9252-ad448e76ce8b	\N	\N	فيبرات X100	فيبرات X100	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	fbc0f908-9a27-4af9-bd59-f4415b45e302	cc47193e-d78d-4ef1-9b20-7f22c90f1d7d	1400.00	1500.00	0.000	1.000	f	t	2026-09-28 13:32:42.612914+00	2026-09-28 13:34:21.726597+00	\N	f	\N	\N
66488c38-3eef-4e37-9528-4f18051b3f06	\N	\N	فلتر زيت ياباني	فلتر زيت ياباني	\N	\N	f4ab4dbf-afb7-4d93-b8da-05151e672d4c	\N	\N	400.00	500.00	0.000	1.000	f	t	2026-09-28 17:51:48.171727+00	2026-09-28 17:51:48.171727+00	\N	f	\N	\N
\.


--
-- Data for Name: inventory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."inventory" ("id", "product_id", "warehouse_id", "quantity", "updated_at") FROM stdin;
4f6b0220-8374-466f-917c-0f936dab09d2	ef8c2ba6-2961-4dc4-91a5-e4807ad8a02d	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-20 19:33:35.251356+00
e2c08d1e-da29-488c-9201-80b652246ced	fc6ea8ce-3aa2-471c-a638-5492f831e7e6	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-20 19:33:35.251356+00
08512cb6-aaf8-4c18-ae6f-9ac0401457de	11ed1686-50e2-4b62-83ea-3f9ec7be1324	f00a0950-fc40-4801-ab3e-f158fdd9e091	24.000	2026-09-27 18:59:48.786358+00
a363c950-e062-4ae1-901f-d08c044f3579	78a50f8f-fe15-49d2-96c9-8603051aa1b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-20 20:32:05.47657+00
966f2a2e-bf2a-4531-b9c8-8a49f1e0173a	a3a57d93-f8d3-4684-b12d-fba192bed3e5	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-20 23:46:06.964973+00
6d315fea-ed38-408a-a112-1c9c758d9503	2ba0d702-dc5a-4cd2-a52b-4a90f0cec736	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-20 23:51:13.729458+00
bdef43d4-888d-42b7-a96a-3a366960a7e0	2e0d25da-8464-473c-a2ee-bf11cf9578e3	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-20 23:51:13.729458+00
3b5348f5-13fe-403e-93e8-c4f341402490	2f1b2410-06a9-4a81-a2f2-00b1116960e5	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-20 23:51:13.729458+00
96d46a4a-aca9-4228-8b19-1ed6b40f3786	2c94f75f-ef17-4da1-9a21-6c3c8324c620	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-28 00:31:17.286378+00
b8e71369-9530-4768-adf7-e69adf0f7900	1a1f5209-6c9b-447e-a3f6-79262f62be61	f00a0950-fc40-4801-ab3e-f158fdd9e091	6.000	2026-09-23 15:30:36.703641+00
93b102a4-f45f-4331-9e68-bd1166def4b0	7b44581c-5033-4181-b336-4e2b20d9636f	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-20 23:51:13.729458+00
9f561494-2daa-4fdf-81e5-2b60b26e9b3a	e7134cfd-69b2-4a0a-aa3f-880b396de336	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-20 23:51:13.729458+00
ebd75510-1c7f-4dc5-af5b-81c248c54f50	f81a2a25-a580-4add-a240-60e90d13b4c6	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-20 23:51:13.729458+00
d1493465-03e7-4c49-8baa-25980f2baeca	f1c8f589-b86a-41b6-be13-023b0748c644	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-21 01:02:23.42689+00
32b6c641-fbcf-4d02-aec2-86c3af4fc8d2	84ac3f8f-2810-4825-8f72-dcfed72a50f3	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-19 13:28:55.094964+00
21ec1bee-430a-42d8-9ef4-fe2fb722861e	55b47be3-5025-4db9-957b-72092714f1c5	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-19 13:29:44.280304+00
d44a6b05-7040-44a7-83fe-86b8b6ba907e	b1aaa196-503a-4f34-9c59-467c768967c5	f00a0950-fc40-4801-ab3e-f158fdd9e091	11.000	2026-09-20 15:01:18.528463+00
c421a37e-a071-4378-be77-95e62156b679	6cfe29ff-540e-4ec5-a7d4-ad334ba32128	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-20 15:04:05.173799+00
54f2c7e2-4ae0-4dd2-85df-53066efb2263	e6a8f397-e3e0-4917-bd53-fcfecc5f84c2	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-20 15:05:46.603385+00
6958401b-37c4-46d6-847f-248f9c21823e	4344e543-5c9f-486d-b18d-342fa1cda47c	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-20 15:13:34.643184+00
88f5f1da-d1e2-412a-b1b0-aa2df4b48c55	05fa1424-9537-454d-832a-d48d708c4e31	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-20 15:13:49.865697+00
3e174106-a81f-455a-869e-266df92f3c32	8cbee3db-8535-4deb-97e9-49c258a8405e	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-20 15:14:07.425454+00
244d2fbb-aa4b-4527-a3c5-7c1bfb37f559	1137edf8-accd-40a6-b7ee-6d64c815caf1	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-20 15:14:23.302839+00
81a54cb5-b178-49d8-b52c-53d4960532ae	2af9ddc8-4b0d-4044-8811-3dec3afd2816	f00a0950-fc40-4801-ab3e-f158fdd9e091	6.000	2026-09-20 15:14:33.176324+00
f859b873-3f17-4570-8a9c-90e11cff1023	17e298c1-347f-4d83-bfa4-0e4ed5d1f7b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	22.000	2026-09-20 15:17:03.643392+00
026b3db0-328f-46e0-beac-dab0920f7c1c	896a5461-677a-4fc6-ac93-d3314cbfd684	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-20 15:29:06.266456+00
9c8fd320-970d-47ac-a1f7-5596ea34537e	5d186234-03f8-4cf9-b526-f82d6b949076	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-20 15:31:27.855449+00
f4a16993-9c90-4c73-8235-6180e0c9e4fd	e0fb09fc-c273-4d58-9423-87d353d807d1	f00a0950-fc40-4801-ab3e-f158fdd9e091	9.000	2026-09-27 09:43:45.756446+00
8620a0d8-2294-42e0-a39d-f82760a014b3	e20967e2-77a4-4bc5-9bb5-b45b65858df4	f00a0950-fc40-4801-ab3e-f158fdd9e091	59.000	2026-09-26 20:48:05.879801+00
478436cb-26b7-4439-8836-f8469d13091a	973e483c-4297-4bdf-b4de-eb08fa04b5e0	f00a0950-fc40-4801-ab3e-f158fdd9e091	13.000	2026-09-20 16:55:52.93649+00
bffd3057-efcb-4392-b8f1-a4ba5a1571e7	8496eb74-7492-43e9-bb4c-6113510f6c70	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-20 16:56:23.93927+00
e82247eb-02f1-44e3-8360-cb2d15741c92	a9375d9c-b63b-4c96-af97-0e2873ddb8c1	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-20 16:56:59.244545+00
5cd89ce4-7fc5-4dfa-8f1f-49e6b687e311	df95b4b1-969d-42c3-88cd-acc98cfc5d9e	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-20 16:57:20.725421+00
c14400fc-f64e-4d57-a7c6-31fb27b8dabd	3f0e3cf3-985e-40a7-a1c7-8b6a03f98a5b	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-20 16:58:16.066016+00
2cb74622-350c-40a6-9b10-eeecb808573d	00061a71-6aa0-4498-89a8-6ddce3edf098	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-20 16:58:40.811539+00
3309e8f9-d40d-4129-83c5-1f64a025ea44	e4e83290-3491-489e-8c81-5a4e0e8cce21	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-20 16:59:11.883628+00
0adeba2e-859f-40b1-bd10-cf2d7d5510c9	a7d95b08-0d2d-4509-b3e2-fc3bc62d98bf	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-20 17:06:11.582872+00
9ee97a9c-6c34-4ac2-88cf-28102f2b44a8	4edd2a9a-bb4f-421a-a024-08b9ac789032	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-21 00:43:07.255057+00
18b6249a-74fd-4a71-8828-7681d88e8d91	c5998fef-4515-4465-a8cb-a9e96d543d51	f00a0950-fc40-4801-ab3e-f158fdd9e091	10.000	2026-09-20 18:27:09.565503+00
de1e8952-92d0-4595-bf37-19a5a2fd962e	232bb42d-f0e8-4580-bd69-5c55cf44c1f6	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-21 12:34:01.456417+00
ea2e489d-529b-492b-858d-655f4a3332cb	054c4d9c-89b0-4367-b349-34d4ef4858f6	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-20 19:33:35.251356+00
dbcce474-d1e4-4440-a0f9-68f85300f16e	341d5503-de65-4b36-96d6-7e18b0d72e20	f00a0950-fc40-4801-ab3e-f158fdd9e091	27.000	2026-09-27 22:26:16.923743+00
842f079a-5733-4a8f-99a8-2a27400bcf11	56f9f2bb-b171-40e9-86bb-28eab2504980	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-20 19:33:35.251356+00
d2b5db26-b5db-4bae-9de8-e47b0ea3cb13	a04ba723-d012-4795-bfef-5f0930da384f	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-20 19:33:35.251356+00
d3a5be4b-fb48-429a-b83e-37799fec9922	fe6f7096-f14d-450d-a17f-5fdcc77b27e4	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-20 16:43:29.008575+00
1c1524b4-f37e-45db-ae54-7eb6f578214d	b04b7f08-0b64-4552-821b-c3001daa6153	f00a0950-fc40-4801-ab3e-f158fdd9e091	6.000	2026-09-21 14:16:50.416594+00
4a7009b4-fe25-4e56-8a5d-601a115d77e9	935c8c9b-bd0c-4a18-9cc4-605c4892bebd	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-21 01:02:23.42689+00
47c85da0-5fdf-4190-bccc-59e2205533b3	aaa13363-f4a7-4e83-a5d1-673b670324d7	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-21 01:02:23.42689+00
c6ec4b45-9ed0-4cef-8f1e-01382f05959a	52847e9c-7117-4b4b-ad10-7a71989405f7	f00a0950-fc40-4801-ab3e-f158fdd9e091	11.000	2026-09-21 12:34:56.324071+00
30448942-4519-48fd-a4fc-04a06f8dcd51	699467ab-d1a2-47ee-a323-3acd358bf9ec	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-21 12:38:25.827595+00
117a01c6-e2c3-4bfc-a642-564d50d899b2	fa4db2cb-96ee-4b13-a939-fdebaf508553	f00a0950-fc40-4801-ab3e-f158fdd9e091	57.000	2026-09-27 19:09:41.483656+00
5bdf67fa-38f6-4356-8930-c862935c6d1a	949a701a-6a24-48ba-9ddf-36df779c9807	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-21 12:41:35.559339+00
3175e793-6ce7-4ecf-b226-dd36e930ba6b	8ae27e8e-5127-4a8f-81ed-ce641f393c66	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-21 12:51:14.038114+00
32667281-bd61-4aa7-b5d7-8c33e2220e9f	159cef6c-5783-4450-b9f4-536b15395656	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-21 12:51:25.422956+00
e2228fdb-cb81-432c-b897-9a7965f288c9	5c4d5b48-b23e-41c2-b354-68e508d70a88	f00a0950-fc40-4801-ab3e-f158fdd9e091	9.000	2026-09-21 12:51:42.379114+00
443d4edd-f0fc-4a8a-9d3c-40ea17df17af	fc0a6282-8c97-4083-b088-498ba5e51ac7	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-21 12:52:21.902185+00
323af4b6-9f2b-44a9-a939-76cf1957f949	b81fec7b-f1ff-4bb0-8f82-6b0c9b3a0023	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-21 12:52:42.373474+00
3c6247ba-acf8-4d21-bba6-f78119a94518	23215db4-e4a9-4299-a378-735c0e080acd	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-21 12:59:56.580341+00
072bc1a3-3651-4270-bab6-5f60081c9de3	1ff6cb61-a52e-4a5e-b41a-ea2fa0c56f96	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-21 13:00:08.793426+00
5c069c6e-192c-482c-b9c4-27c4f1f636a8	9a33c016-39c3-459b-abb4-86e89ca804b8	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-24 16:32:38.201787+00
2138ff75-f6fa-413e-b5b7-6e795d89d475	b2511f74-ecc2-484a-9c1e-a955efce05b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	8.000	2026-09-21 13:06:46.792658+00
9e21073a-e1e3-48f7-9668-55063bec961a	c5c49f7a-da74-4de1-b31e-f065f37f7890	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-21 13:13:32.152457+00
31e84b70-ebb1-40a1-8601-1eb813b18500	3cb56b14-6ea0-493f-a7dc-681134db5917	f00a0950-fc40-4801-ab3e-f158fdd9e091	98.000	2026-09-22 12:30:30.890358+00
4b473e13-6f07-486b-8ebe-560428a5c2e8	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-26 17:06:44.57585+00
444a9e22-e8cc-436f-9c17-a78e2d8d11f1	a7887b2b-34d2-45cb-9552-4938b2a803e5	f00a0950-fc40-4801-ab3e-f158fdd9e091	17.000	2026-09-21 14:27:58.390452+00
e3548419-aab1-4100-83ad-783bcc7c810a	357bbcd8-aad8-4310-a076-15742083bef3	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-20 23:51:13.729458+00
b91a8d28-6c60-4459-855a-267933636372	1120add1-20c6-4ae5-a729-5c716708488f	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-21 18:15:50.836514+00
cc2d4155-0d30-49f3-a5b6-f45ea4d95289	1308cb1e-cc8c-4a85-ab6a-92ccf53883a3	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-21 18:15:50.836514+00
8d6a429a-f55b-47af-ac0c-3520bfdbd33d	1992e98c-4fbf-4210-82ad-91c8ca96a679	f00a0950-fc40-4801-ab3e-f158fdd9e091	8.000	2026-09-21 18:15:50.836514+00
8cb7ecbb-db38-4d12-b226-acf8614e4041	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	14.000	2026-09-28 00:31:17.286378+00
612273b5-e3bb-43f5-bbfd-1733293814ee	39b92f0d-f8c4-418c-a0ec-325a23be3970	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-21 18:15:50.836514+00
6c5504cd-db84-4e52-91c0-b2c666f5c490	5738a4b5-aa2e-4325-b60b-d6d980dbc1fc	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-21 18:15:50.836514+00
aaa81722-285c-49f3-b091-e90c1324f23f	661bdc39-9def-4ddd-96af-0d6d91d8af0e	f00a0950-fc40-4801-ab3e-f158fdd9e091	36.000	2026-09-21 18:15:50.836514+00
7f25b03a-e895-4286-ae9e-63b7ce91e37b	1ca11cda-7ca7-46b4-9c9d-85bcb6bbfb58	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-27 19:50:15.242696+00
f32fcba8-8e78-4a9b-a16b-e0ec21939c74	f59d9d20-1a3a-4486-b831-29b46ab327a4	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-26 17:10:04.332592+00
eb0b0e30-9f06-49d4-bb63-44975473a1b8	726f273b-fdf2-467d-abf3-8f71d714933b	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-23 15:30:36.703641+00
c978234b-e29f-4a89-a1dd-9f1607f6f01e	b031b84c-6601-4c0f-8097-1baef1482013	f00a0950-fc40-4801-ab3e-f158fdd9e091	13.000	2026-09-23 15:30:36.703641+00
545665ad-4e6d-4812-879e-cd851c88380e	80e5f29e-e3ec-4293-bd3c-3a335ab2477d	f00a0950-fc40-4801-ab3e-f158fdd9e091	10.000	2026-09-27 22:02:16.37897+00
ca410403-f30e-4549-9d08-eda03b4dadac	fb1df70f-6f73-40fe-89fa-bea2be5c2d87	f00a0950-fc40-4801-ab3e-f158fdd9e091	19.000	2026-09-28 00:31:17.286378+00
2ba9de32-cd6d-4016-8040-294a54fe7d52	95be6ea9-d2a1-4dbc-bd6d-a9bac27ca332	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-21 18:15:50.836514+00
8d6a8191-bb03-43e8-a865-a15af9ca6ab3	68530644-1472-4fa9-84c0-e82aa848ff0c	f00a0950-fc40-4801-ab3e-f158fdd9e091	16.000	2026-09-27 22:27:05.850219+00
ecfcc0f5-3a20-4b07-babe-c4528d8497c4	3ffdfd69-4efd-43cb-9a13-ed72990890b2	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-21 18:20:48.734009+00
27f21341-8f9c-4822-93ca-7f838ab70b00	4333bfd6-0bd3-44cb-8eca-01c380e70a09	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-27 15:33:24.705048+00
4d8b45b7-a197-4e3a-bb07-1848005b1aff	8bc6d325-eead-424a-8e56-117a0adc2427	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-21 20:01:43.144407+00
3786e68e-03ea-4f26-9aaa-c1df7a43c405	69adae6f-2b51-43ec-9329-ce2f65660eaf	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-21 20:04:10.865112+00
a2e64b22-ad25-4bee-b307-be9a5997ece2	e4cef90c-932f-4d2e-823c-5321dadcdbd5	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-21 20:06:21.941612+00
06f5a4b2-887e-42f8-bb52-0aac7881aab8	5879e2ce-ab29-4fe2-bac1-e2d4d887f845	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-21 20:09:21.662644+00
3708197b-8749-4190-9486-50256ae69c4b	cc92d23e-c4c1-4e76-8c4c-419501d4dc11	f00a0950-fc40-4801-ab3e-f158fdd9e091	6.000	2026-09-21 20:13:56.673719+00
ecd8ba84-b1a8-4eb1-97f6-7c85b641f411	950566db-7963-4bf2-a6b3-dd646cbe711a	f00a0950-fc40-4801-ab3e-f158fdd9e091	35.000	2026-09-21 20:22:06.54864+00
866141c1-0951-4290-86d9-14bc55eb551f	2dc1b790-5ffc-4d20-9372-3bdbf3d7b663	f00a0950-fc40-4801-ab3e-f158fdd9e091	46.000	2026-09-21 20:25:09.500714+00
aea58d45-fb2f-4734-aae1-01fd14cdc0f0	c91854e6-9439-406a-8012-8cad4f8282d8	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-21 20:28:09.241117+00
6a9741ec-438f-48f5-bb6e-28c5b4fc37d6	47a0c003-5d56-4e9a-a09b-e9fba536d726	f00a0950-fc40-4801-ab3e-f158fdd9e091	7.000	2026-09-21 20:29:49.346945+00
f40cb8a1-62e1-46df-a0a6-ebf943a7a686	8e1d8b38-b87b-4950-bba2-be1e4c8ad70e	f00a0950-fc40-4801-ab3e-f158fdd9e091	17.000	2026-09-21 20:34:59.990144+00
5f4fdcd5-076a-491e-ba8d-a017fde6a3e7	d34e2069-15cb-473d-a93f-60e931b4c622	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-21 20:42:40.50794+00
f37ed5e7-98de-46d4-b917-6891921b8321	b57ba094-928d-4eca-97fa-b3863ab7ba8e	f00a0950-fc40-4801-ab3e-f158fdd9e091	17.000	2026-09-21 20:46:55.330054+00
77ecfefe-3ad8-4e56-bf55-791565b8b4be	8f42e5fd-7676-4f6b-bbf3-346fbf6b25fa	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-21 20:55:14.388544+00
628c0b55-f339-4ae1-b380-3cbd32ed323d	88b84530-e118-48a2-b54b-c60684c7b68d	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-26 20:48:05.879801+00
091a1ca7-dfc0-4cf0-a16c-195fa6bc7948	8f38bd22-1abf-4689-b78b-13ba2703b0ad	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-21 23:02:30.506344+00
50aa0ce2-ff4c-4920-aaaf-112a34f89f15	3425d17f-c9de-42a3-81e7-081005b4bec7	f00a0950-fc40-4801-ab3e-f158fdd9e091	8.000	2026-09-23 16:13:26.616205+00
07fcb4d4-7087-4022-8d8f-2ea0ec8e4bc8	08392996-e913-4f1f-9518-ba1a17b274af	f00a0950-fc40-4801-ab3e-f158fdd9e091	7.000	2026-09-21 23:07:15.48219+00
e557dbe4-da35-479e-bfcd-1851ef789787	7a4bc7d1-1701-44dd-9297-8e0bbd04c19e	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-23 16:14:29.38123+00
d081c172-b190-4c3f-9101-f3dcd0e77408	c83448c4-85bb-4d60-bd71-ba86fe643d10	f00a0950-fc40-4801-ab3e-f158fdd9e091	7.000	2026-09-22 11:08:43.096348+00
9283824e-9b59-4cdd-b75a-f5df88fcbdc8	ead6e7a8-0fde-4717-bd4b-65fa0f59a35c	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-22 13:31:38.268963+00
a79ae843-50d0-4f2d-b19e-a0ed962168a6	2d23f736-104e-46fe-ba9c-bddbb8e5793f	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-22 14:42:51.431398+00
da2d6e52-5abc-43d8-8388-8017c8d60cff	a067aa3b-ed5c-421f-ad43-992b8daf5af2	f00a0950-fc40-4801-ab3e-f158fdd9e091	16.000	2026-09-22 16:52:26.464804+00
81df1345-c28d-4532-8563-3f65e74faaf5	17cb9df6-89f3-47f5-a2f6-c105aa579aae	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-28 14:56:55.615501+00
f9ddbfdd-eaad-454c-8ece-57fcc55d0576	c156a116-eef2-4a47-94dc-00b514f7b9a2	f00a0950-fc40-4801-ab3e-f158fdd9e091	9.000	2026-09-22 18:16:30.305763+00
5f7db78c-ab71-4689-b9e4-a3d1fbd9439a	b1e6e367-f6c6-4bb4-af2f-f7a71245c5a9	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-22 18:21:56.051621+00
8f3e739f-c51b-4e3e-90c1-289d71f608ef	7a7f8655-57b8-48c1-98aa-04830d324e0b	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-22 18:27:07.21505+00
5952a5ee-cf3b-47fa-ab07-b070352a749a	7e0efeb0-8264-4598-9ff4-644124b6b55a	f00a0950-fc40-4801-ab3e-f158fdd9e091	23.000	2026-09-22 18:29:34.96627+00
a4785b42-89ab-4b46-9334-e80c88818c04	6b9db4f0-57cf-4502-a410-8461c9aed3f5	f00a0950-fc40-4801-ab3e-f158fdd9e091	7.000	2026-09-22 18:31:23.927985+00
9b18ee07-2624-43ff-a89f-a9f9ed2aedf5	58f54eda-098e-4e7d-a867-7d8a425b18dd	f00a0950-fc40-4801-ab3e-f158fdd9e091	8.000	2026-09-22 18:35:57.87891+00
53b80f06-2f5a-4632-a84b-65e30fb64329	159eb1bb-920d-4fac-9751-6c15800a187b	f00a0950-fc40-4801-ab3e-f158fdd9e091	8.000	2026-09-22 18:36:16.64676+00
6a8802d5-879e-49d0-9f9f-e63f6a3b23a6	9e60ec82-1c0b-4838-809c-177e75e48dee	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-22 18:52:15.501701+00
818a01e1-3a2f-4f2e-8978-43fdbed2f133	61f0cab6-4cf4-4276-a31b-ff5ec62a7420	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-22 18:56:00.311019+00
360adccf-19f3-47e5-8331-57c92695937d	e0f400b1-a39e-40cf-a404-72e31c439db9	f00a0950-fc40-4801-ab3e-f158fdd9e091	40.000	2026-09-22 18:56:13.870719+00
82b4bfca-7567-41e3-a519-3a412f414029	ccc3e220-3d0f-4d3a-b4fa-7ed0fc4acbfc	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-22 19:22:03.215538+00
12f0903b-e8e9-4657-9101-123a475483c5	42f9e0c1-bf46-45a8-be43-d71e4204fc97	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-22 19:26:12.488407+00
12b1c025-ff8f-482a-95e7-04f73dd501a0	7928527c-6a32-4920-860f-e573a3dc5f18	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-22 19:27:40.553243+00
79102090-7e2d-48de-9acd-45c5d6d6c60a	e86a0a0b-aae9-40e3-bf87-d93526424c0d	f00a0950-fc40-4801-ab3e-f158fdd9e091	20.000	2026-09-22 19:31:59.214492+00
31f6223e-d70f-4fdf-ae54-10e75afe3264	2dce84a6-e616-4e17-916c-7cff9d3b2790	f00a0950-fc40-4801-ab3e-f158fdd9e091	14.000	2026-09-22 19:32:08.985559+00
2d3b39f4-0026-4d4b-bfac-534ac12d9b83	b0ad0530-d55d-477e-bd58-6d54b6e70039	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-22 19:33:48.445393+00
f5fb94a3-a605-46d5-953d-11e2b26e3065	0189bc7e-b550-4348-867a-1ef3076e4d88	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-22 19:46:50.566018+00
3f274c30-ebc9-439e-8ea7-802aa4e68583	c34f9e18-82d3-4199-a39a-44c6c104d997	f00a0950-fc40-4801-ab3e-f158fdd9e091	9.000	2026-09-22 19:47:09.149965+00
adc6732a-fd8a-4bb9-8401-b10c78ab87b3	c806810f-3e1e-457d-9185-4ce688e8c24c	f00a0950-fc40-4801-ab3e-f158fdd9e091	6.000	2026-09-22 19:47:14.891692+00
eaf7c024-1aae-4edc-b02c-16ebf590134b	126163e3-d64d-4473-bea2-2e8e8aec129a	f00a0950-fc40-4801-ab3e-f158fdd9e091	19.000	2026-09-21 23:07:15.48219+00
9eb2a6b2-d043-4391-9a81-3d1cc432c946	afe826ee-744f-49d8-ab42-1e8ad34dda26	f00a0950-fc40-4801-ab3e-f158fdd9e091	23.000	2026-09-22 20:03:39.576066+00
d6c888cd-7725-4692-a166-a7af3e0e590d	02ec7152-406f-4ff1-bbfc-24db0fc1cd3c	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-22 20:49:02.506731+00
6745d2df-557d-49f0-9c55-782ee0cef327	5073322c-80d1-4ddd-8f49-af66a9d03e80	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-22 22:15:47.988338+00
5c30ccfd-bac3-42a7-b644-36a09073031b	28e27bd6-fa77-4fa4-b03e-e76abed1e884	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-27 21:02:30.232727+00
a804a555-9cb3-4ac3-bff7-59df60c04d66	4be22fbe-0616-45ff-8dae-103a8d7613e8	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-22 22:23:58.659196+00
248dea91-9103-4f05-b21e-38d4e61b97c7	df1b6c5e-f8e7-4994-8860-d8cc66b6a761	f00a0950-fc40-4801-ab3e-f158fdd9e091	20.000	2026-09-22 22:30:07.178256+00
fb359584-22b7-4459-93fb-70640cefbc55	97fe00b9-956c-42c0-b0c8-b04481cb9665	f00a0950-fc40-4801-ab3e-f158fdd9e091	16.000	2026-09-22 22:30:26.389222+00
36704c47-0570-4b9c-901a-3447e8f43543	4af0ad25-987f-4628-ac91-13467f10238c	f00a0950-fc40-4801-ab3e-f158fdd9e091	13.000	2026-09-22 22:31:48.238509+00
1aa0b90b-1a81-4481-b86b-5e7d947be8bd	1e709de5-eaa9-4218-b382-55fd7beb11b0	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-23 14:54:07.408259+00
103ffbc5-662b-4f3d-a9d3-03e259b769e1	6b97b2f4-dac6-4e92-bd5a-a01ea8b73b13	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-23 15:30:36.703641+00
40d8fec9-cba3-4915-9669-faa94b6509fa	27388e7b-ef84-410f-befb-6acae107712b	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-23 16:14:52.769366+00
56223425-53c1-4172-bb63-ced66bcb45c0	a2f663c6-b362-41e7-ab30-9144d30a33b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-23 16:15:19.165622+00
13d8a566-44a5-454b-a47f-b1b3b723dcaf	d27977cd-6e65-4b53-89ab-8b4080cc4738	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-23 16:24:03.701825+00
2c04ba7a-abc5-42de-a30a-745d7bdd515d	6391a825-1fa2-4d49-8c77-b2110d7358cd	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-23 16:24:17.347198+00
4b5d6de2-754b-4fa6-b992-cce587a885b9	45f3b222-44eb-46d4-af59-39a758dae237	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-23 16:24:58.744355+00
97b7c055-1f23-46bf-9077-b572c3b162c3	6ecccb78-add2-4de3-a137-d6798505ac49	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-23 16:25:35.342675+00
37cc449b-4b1c-4565-a927-c73f946beaf1	4207f0a5-a4d4-4989-921b-5a68b445b0d1	f00a0950-fc40-4801-ab3e-f158fdd9e091	99.000	2026-09-23 16:43:40.448395+00
63214f6f-9160-4ee6-9605-35ee93171f24	bec3baa6-b867-4560-97a8-3c800e2fdf98	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-23 16:43:40.448395+00
67836892-8dc8-45f3-af05-831f185d3d3a	79ce9af2-7485-4824-869f-2d318f916878	f00a0950-fc40-4801-ab3e-f158fdd9e091	6.000	2026-09-23 16:48:23.000857+00
7f5e14e2-4874-41cc-83f0-1bddadeffbbc	cecc9d0f-4342-4591-8553-dbaffe71b588	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-23 16:49:43.259006+00
e2fa5ed7-8e8b-45cc-9bc5-d9e4d0f963d3	db0d815e-1ca4-42ca-bc0d-8096bb65ec24	f00a0950-fc40-4801-ab3e-f158fdd9e091	9.000	2026-09-23 16:50:34.55671+00
1e6fe306-f00d-4d75-9a2b-1ffbd9728d91	7e0feeb6-93dd-4d00-beb1-0199132416dd	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-24 11:38:28.738239+00
db84fb36-4487-43d2-afe0-bfa6a6cb731e	8cb87967-d5be-427d-bc84-ecce76d8b40b	f00a0950-fc40-4801-ab3e-f158fdd9e091	8.000	2026-09-24 11:41:21.271557+00
b17efd44-7743-48f6-b517-a11de05eedf1	7d5eb3e7-707f-4380-84ec-45257dd439fb	f00a0950-fc40-4801-ab3e-f158fdd9e091	7.000	2026-09-24 12:04:15.777298+00
f6bc2c72-6f8d-4acc-afd0-e6be922a1b70	8ac97183-bd50-4b64-a6dd-8ff577a8042d	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-24 12:04:38.129344+00
51b341cf-b3f6-43e2-905e-b262ac48edd4	31b3e4fe-3b75-47a1-9a3c-a7ab4760a7c9	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-24 12:05:01.284182+00
b2564116-b10a-46eb-9bf6-548dbafd2bf6	ba77826c-7a1e-457e-b178-0ee046f5eb15	f00a0950-fc40-4801-ab3e-f158fdd9e091	24.000	2026-09-24 12:13:27.605415+00
e6a0e8ba-9db8-4b26-8bd2-e5cf67085b1e	e7f288f4-7e80-4edb-b5c2-a65662a27340	f00a0950-fc40-4801-ab3e-f158fdd9e091	6.000	2026-09-24 12:13:35.74793+00
ff348fbd-adb1-4ffa-84c0-927a70afd19a	a1a3fde4-5ef8-4fe5-8111-9ba9fe82bbf1	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-24 12:14:29.613754+00
9d71cbd7-6e4b-485b-8666-cd8f9ff07a7b	af569f77-8680-4d22-a686-93f851b08ee8	f00a0950-fc40-4801-ab3e-f158fdd9e091	32.000	2026-09-24 12:15:20.796159+00
e86268d2-8d83-4b29-971a-792cd1cd44a3	0ded29e4-ea57-415c-a933-bf02c6d492a9	f00a0950-fc40-4801-ab3e-f158fdd9e091	28.000	2026-09-24 12:16:08.498648+00
a06e3001-705c-4888-b613-b8329b17b36c	dcedf7e6-62a7-47bd-8d16-f6bc909e746a	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-24 13:01:29.460731+00
6b2c587e-20cb-4d96-8557-90986a001584	84841448-1831-4b7b-b014-4ee11c4beb65	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-24 13:02:01.311151+00
819122d0-fc76-4c6c-9e73-ff0391fb60dd	46af6a39-fef3-4fa6-92d6-b7d51ad09bd9	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-24 13:02:44.311734+00
c5bf7e83-bb8c-4eae-a540-cb5aa855878f	2f57de48-5426-4618-9b0a-a87fb9b00b0d	f00a0950-fc40-4801-ab3e-f158fdd9e091	13.000	2026-09-26 13:09:29.998513+00
aeac674e-43cf-4195-bea0-063818db8654	964387a5-0a14-450d-bcbf-a251477f441d	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-27 15:33:24.705048+00
1ac93602-553e-4c3a-8a40-b048eefb5540	09d0d848-423d-426a-98a7-2c95e4738540	f00a0950-fc40-4801-ab3e-f158fdd9e091	28.000	2026-09-27 20:22:58.5971+00
ed06b575-86ad-4d10-8f63-85d19973afba	050d2592-c49a-47fc-a43f-810632c9dac9	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-27 22:27:28.78832+00
5a159112-431e-4d5c-b327-37586a11f8d9	4ba7afa5-3784-45b4-8ad3-ef8dae4f085d	f00a0950-fc40-4801-ab3e-f158fdd9e091	30.000	2026-09-24 13:03:16.397743+00
78b6c317-aa70-4e3e-a6a9-f104874be153	3b8d031a-0f83-4775-824e-17aa0fa276d0	f00a0950-fc40-4801-ab3e-f158fdd9e091	18.000	2026-09-24 13:05:34.465367+00
54358135-0979-420d-9826-5d98f22f9eb0	22c1908e-f7a5-42be-9619-60a2f3f51c57	f00a0950-fc40-4801-ab3e-f158fdd9e091	9.000	2026-09-24 13:13:05.872843+00
4c1f6a35-2116-4b34-9cf9-f702d0d9c7e1	c7b09c61-befd-452f-a58e-55d336ebffdc	f00a0950-fc40-4801-ab3e-f158fdd9e091	8.000	2026-09-24 13:14:14.883737+00
8d7307e2-1bc6-4b2b-bf6d-641f35776e88	0194a362-4c41-4ab4-90a0-1b863931747e	f00a0950-fc40-4801-ab3e-f158fdd9e091	6.000	2026-09-24 19:10:11.695998+00
aa052ed9-7d02-4f39-9001-e335473e0eee	3b27463d-dcfa-460a-9bef-9415cce5f42a	f00a0950-fc40-4801-ab3e-f158fdd9e091	9.000	2026-09-24 19:55:06.509355+00
8be760b7-a7b6-4890-9fd4-5ade8fa03926	e8c7cd21-01b2-43a8-a710-98dcee444c2c	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-25 18:17:11.151926+00
c95d0181-0c28-43f6-ba7f-73d454908016	23a108fd-1e68-49cc-9b02-48672022fdf5	f00a0950-fc40-4801-ab3e-f158fdd9e091	9.000	2026-09-25 18:18:07.210601+00
e4bf4ab3-a6c2-448b-b054-e9ea7dbc6bae	b4937e5f-74dc-497a-ac20-2a6b01faba4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-25 18:18:23.434485+00
aa09713b-a8c9-4ed6-a938-b02879004f0c	457a1957-d5bc-4964-b819-f443f79fcbb6	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-26 11:35:43.804891+00
0d068229-3fba-4eda-a508-458036965b5b	c5385f9b-57f1-4f9e-9c58-9458f2f2c541	f00a0950-fc40-4801-ab3e-f158fdd9e091	8.000	2026-09-26 11:36:07.234945+00
f4651793-c53c-4a0e-86a7-90ac79f4639f	c1837e2e-c331-4e19-bbb1-b9f3d504f30c	f00a0950-fc40-4801-ab3e-f158fdd9e091	9.000	2026-09-26 11:40:32.2329+00
a7a922b4-ebda-4276-a8cb-db2098190701	23448fc7-bf39-4773-be4e-55c3da5af0b2	f00a0950-fc40-4801-ab3e-f158fdd9e091	7.000	2026-09-26 11:40:44.056584+00
ac631a24-5bfd-4f96-abcc-54a4fec1e46a	be2bade7-b8d5-43e3-bf9f-7d469fc94e82	f00a0950-fc40-4801-ab3e-f158fdd9e091	7.000	2026-09-26 11:41:26.534927+00
d007f3cb-91fb-4683-a2d1-15425de82011	26e8d8d0-32ac-4abb-a5be-46766973051a	f00a0950-fc40-4801-ab3e-f158fdd9e091	10.000	2026-09-26 11:41:45.887686+00
bf2cdac7-e24f-4220-95b4-d683927ff627	fd10f719-0df5-40dd-8f0a-6a1c8de70a36	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-26 12:35:13.608939+00
6604d162-75b4-4815-87e6-2d8ff62158df	13f5284b-62bc-4297-899c-998cdb330c0d	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-26 12:35:20.690702+00
7cdf4719-3a2c-4513-9495-a3e8268151d0	24cedfdd-dd19-4347-9091-1e9495e0a4e9	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-26 12:35:44.476921+00
29870aa2-5c1f-4c06-84ba-2f4906c933f6	58dcb1ba-bd63-441a-a2a4-95ad38d0870e	f00a0950-fc40-4801-ab3e-f158fdd9e091	14.000	2026-09-26 16:58:00.076874+00
1ce79291-b4dd-4a56-957e-4edc0931f616	7a1f6013-5e59-4443-9637-32d425ec1d7b	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-26 17:15:33.6026+00
ab675bcf-6a84-4645-a984-3fbbeb0c7212	f3f6271f-50d7-42b2-8a23-5d688fd0042d	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-26 17:19:35.153889+00
757b0154-7b01-4511-95b8-58b911782292	a8226c8a-ba78-42fa-8335-fa056cb37be8	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-26 17:20:45.353853+00
d2f0b733-ae87-40ff-9c93-856084b011e4	17974d65-2b39-4e66-b3e9-54e13ea3f066	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-26 17:21:11.447902+00
2324ba20-f81f-4f2c-addb-6c08fa9b0a74	3cccd0e8-c588-4633-a6b6-47f080d2b98f	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-26 17:22:24.264086+00
a6d7cddb-1197-4179-afad-954d2b4366a0	3e68ec96-b5ed-4d7b-856b-570a51e12463	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-26 20:48:05.879801+00
d5d25d74-78ad-43f9-b1d4-967f640ce20e	8d82cbd4-6995-46f4-9591-7968c4a572d4	f00a0950-fc40-4801-ab3e-f158fdd9e091	5.000	2026-09-26 20:48:05.879801+00
4d952a08-1b2d-4e18-ad3b-9ec12d0a945f	9ed1022c-9015-4165-aace-fbd3a371f5b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-26 20:48:05.879801+00
86065834-3b50-4cee-b06e-2270bb1de8dc	ec2ae3b7-98b2-4ad8-9b8b-7c6a359144c0	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-26 20:48:05.879801+00
1cc075f2-718e-43cd-86a7-f334a1cb5c79	fc939814-0b00-4e41-bbb0-c8d2ca758359	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-27 15:15:40.568111+00
c3322d0e-de55-4dec-8c7d-46888c1dd8a8	1ba1671c-a827-47b0-a2e5-5fd032ac2490	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-27 16:27:58.040428+00
e1bc554d-0d38-4b90-8441-83d683f84da4	4bc66865-1f22-4dd0-8cea-375f3088550d	f00a0950-fc40-4801-ab3e-f158fdd9e091	4.000	2026-09-27 17:03:10.811537+00
589b39e3-9947-427c-b7a3-76aa929ab19d	3ce5cd23-d98f-4ed1-aace-80348866b1b1	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-27 17:15:10.141909+00
65174cd5-83ff-42a3-8172-f696f768442c	37b8b5ed-dc2f-416c-a614-df1b6ca4902f	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-27 17:15:16.753191+00
22cf7471-c879-494e-a4fe-304874638c5d	87a70022-2358-43bf-be60-1fc57cbcd68d	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-27 17:16:14.015144+00
5e6c6ece-6c06-4fb9-bd3c-8e137c4f812a	d0ea5012-f420-479c-8d06-db8394b66e65	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-27 17:16:22.827165+00
163251a9-5efe-45a3-a591-69dd8601b825	0c97bd4c-2abc-43db-bb30-d91bc3370e7c	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-27 17:27:30.21931+00
eace72b2-d272-4e8f-a53d-792cdeadb493	9fd7f5bf-be1a-45a5-8d4d-e520803d3d5d	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-27 17:39:10.604929+00
479a5fce-42df-4f86-8508-3733e3061ec9	6607f1cc-7507-4ae3-a658-7b421cad5ad2	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-27 17:18:32.125785+00
e3851c74-3544-43c4-b497-a5f1dd3f7b05	9851c408-0596-48ea-8fc1-7bc214717a97	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-27 17:52:16.002165+00
d088161a-9d34-41c4-90ef-d000b8e7b066	8104da92-c9a7-4a6d-a5a3-89d03bfbd93c	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-27 18:00:51.593254+00
7cb08ade-d983-4b49-9091-48901cbf7ec6	66658002-0da1-416c-bbcd-c6ce034ab1dd	f00a0950-fc40-4801-ab3e-f158fdd9e091	3.000	2026-09-27 18:58:28.907346+00
8c548459-4b8f-40c4-8fb9-bd238494059b	c802adac-afc2-445b-9fdb-b02336c37644	f00a0950-fc40-4801-ab3e-f158fdd9e091	7.000	2026-09-27 18:59:48.786358+00
dcc19cae-7a23-43ad-8400-cf0b456a9778	48c45a44-5f20-4fd7-bf80-95e427064b7b	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-27 19:05:10.193006+00
95f7a7f6-807b-49d0-9375-a50c0b185c9d	7afca9de-fc1c-45dd-9d8f-39f5b1b76266	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-27 19:09:41.483656+00
d6a62557-64d3-4c01-ae5d-dbcfbb0f01a3	aa31fd37-7e24-4c2d-9e48-3c0e4c989db5	f00a0950-fc40-4801-ab3e-f158fdd9e091	6.000	2026-09-27 19:43:35.851785+00
fd522cba-c96c-49d4-b030-e3a10dcbb1b0	22f584dc-9914-48b1-98d2-2e7890e3fad2	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-28 00:31:17.286378+00
30a10dd3-9419-46d3-9696-0e48efb23d9e	9922e1aa-c67f-4007-a093-8528fd89e4f1	f00a0950-fc40-4801-ab3e-f158fdd9e091	2.000	2026-09-28 00:31:17.286378+00
c4c833b7-a8b7-4f42-a8c3-648b6c21bba2	9d116d69-0484-41d4-8b27-f169134c764d	f00a0950-fc40-4801-ab3e-f158fdd9e091	0.000	2026-09-28 00:31:17.286378+00
2d653f02-ba0a-4b10-b1ef-2ca2d7cef33d	08bae2b8-58ae-46a3-a30e-aaae2c33c4ab	f00a0950-fc40-4801-ab3e-f158fdd9e091	21.000	2026-09-28 13:12:28.818171+00
355cfa1f-703d-4f90-95ad-b409e9f450e1	bd9ec08a-349d-44c6-9252-ad448e76ce8b	f00a0950-fc40-4801-ab3e-f158fdd9e091	1.000	2026-09-28 13:35:13.392158+00
59101290-6601-4060-9814-b6e2c737cd2f	3c707e7f-c6ac-4493-a5ac-1a4b2663ca7d	f00a0950-fc40-4801-ab3e-f158fdd9e091	10.000	2026-09-28 17:37:42.756868+00
\.


--
-- Data for Name: loyalty_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."loyalty_transactions" ("id", "customer_id", "points", "kind", "reference_type", "reference_id", "note", "created_by", "created_at") FROM stdin;
\.


--
-- Data for Name: platform_admins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."platform_admins" ("id", "user_id", "role", "is_active", "mfa_required", "created_at", "last_login") FROM stdin;
9e4803ac-63ea-4b20-9825-960f298823c1	7ae4823c-0946-4765-96f9-881dbf42b316	superadmin	t	f	2026-09-24 04:11:36.381533+00	\N
13177e18-ede3-4663-b2ab-03361dedf3f8	ef8142de-d644-4bd6-aa37-5613b041e0ad	superadmin	t	f	2026-09-16 00:19:56.217835+00	\N
\.


--
-- Data for Name: platform_audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."platform_audit_logs" ("id", "admin_id", "user_id", "action", "target_tenant_id", "payload", "ip_address", "created_at") FROM stdin;
194b4cd3-847f-46dc-9909-f143ed374265	\N	\N	PLAN_UPGRADE_PROFESSIONAL	default	{"new_plan": "professional", "previous_plan": "enterprise"}	\N	2026-09-17 16:43:49.373672+00
\.


--
-- Data for Name: platform_modules; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."platform_modules" ("id", "name", "description", "category", "dependencies", "nav_items", "routes", "is_active", "created_at") FROM stdin;
core	{"ar": "النظام الأساسي", "en": "Core ERP"}	{"ar": "المنتجات، المبيعات، العملاء، المخزون الأساسي، الإعدادات", "en": "Products, Basic Sales, Customers, Settings"}	core	{}	{/dashboard,/products,/catalog,/inventory,/sales,/customers,/settings,/notifications}	{/_app/dashboard,/_app/products,/_app/catalog,/_app/inventory,/_app/sales,/_app/customers,/_app/settings,/_app/notifications}	t	2026-09-15 19:53:03.494041+00
pos	{"ar": "نقطة البيع السريعة (POS)", "en": "Point of Sale"}	{"ar": "واجهة الكاشير السريعة والباركود والطباعة الفورية", "en": "Fast cashier interface with direct scanning and printing"}	module	{core}	{/pos}	{/_app/pos}	t	2026-09-15 19:53:03.494041+00
purchases	{"ar": "المشتريات والموردين", "en": "Purchases & Suppliers"}	{"ar": "إدارة فواتير الشراء، حسابات الموردين، وإدخال المخزون", "en": "Purchase invoices, vendor management and receiving"}	module	{core}	{/purchases,/suppliers}	{/_app/purchases,/_app/suppliers}	t	2026-09-15 19:53:03.494041+00
returns	{"ar": "إدارة المرتجعات", "en": "Returns Management"}	{"ar": "مرتجعات المبيعات والمشتريات وتسوية المخزون والذمم", "en": "Sales returns and purchase returns with inventory adjustments"}	module	{core}	{/sales-returns,/purchase-returns}	{/_app/sales-returns,/_app/purchase-returns}	t	2026-09-15 19:53:03.494041+00
payments	{"ar": "التحصيلات والديون وكشوف الحساب", "en": "Receivables & Payments"}	{"ar": "تسجيل سندات القبض، كشوف حسابات العملاء، إدارة سقف الديون", "en": "Payment receipts, customer statements and credit tracking"}	module	{core}	{/payments,/debts,/account-statement}	{/_app/payments,/_app/debts,/_app/account-statement}	t	2026-09-15 19:53:03.494041+00
expenses	{"ar": "المصروفات التشغيلية", "en": "Expenses"}	{"ar": "تتبع بنود الصرف والمصروفات الإدارية والتشغيلية", "en": "Track operational and administrative expenses"}	module	{core}	{/finance}	{/_app/finance}	t	2026-09-15 19:53:03.494041+00
multi_warehouse	{"ar": "تعدد المستودعات والتحويلات", "en": "Multi-Warehouse & Transfers"}	{"ar": "إدارة فروع ومستودعات متعددة، ومناقلات المخزون بين الفروع", "en": "Multiple branches/warehouses and inter-warehouse stock transfers"}	addon	{core}	{/warehouses,/transfers}	{/_app/warehouses,/_app/transfers}	t	2026-09-15 19:53:03.494041+00
barcode	{"ar": "الباركود وطباعة الملصقات", "en": "Barcode & Label Printing"}	{"ar": "توليد ملصقات الباركود، قراءة الكاميرا والماسح الضوئي", "en": "Generate barcodes, scan via camera/hardware scanner"}	addon	{core}	{/barcodes}	{/_app/barcodes}	t	2026-09-15 19:53:03.494041+00
loyalty	{"ar": "برنامج ولاء ونقاط العملاء", "en": "Loyalty Program"}	{"ar": "احتساب نقاط المكافآت واستبدالها بحركات مشتريات", "en": "Reward points and loyalty tracking for customers"}	addon	{core}	{/loyalty}	{/_app/loyalty}	t	2026-09-15 19:53:03.494041+00
batches	{"ar": "تتبع الدفعات وتواريخ الانتهاء", "en": "Batch & Expiry Tracking"}	{"ar": "تتبع أرقام التشغيلات وتواريخ الصلاحية للأدوية والأغذية", "en": "Track lot numbers and expiration dates"}	addon	{core}	{/batches}	{/_app/batches}	t	2026-09-15 19:53:03.494041+00
advanced_accounting	{"ar": "المحاسبة والتقارير الختامية", "en": "Advanced Accounting"}	{"ar": "دفتر اليومية، ميزان المراجعة، قائمة الدخل، والميزانية العمومية", "en": "Daily Journal, Trial Balance, Income Statement, and Balance Sheet"}	enterprise	{core,expenses}	{/daily-journal,/trial-balance,/income-statement,/balance-sheet}	{/_app/daily-journal,/_app/trial-balance,/_app/income-statement,/_app/balance-sheet}	t	2026-09-15 19:53:03.494041+00
analytics	{"ar": "التحليلات المتقدمة والتقارير", "en": "Advanced Analytics"}	{"ar": "لوحات بيانية موسعة، تحليلات الأداء والربحية وتقارير المبيعات", "en": "In-depth visual charts, profitability insights and detailed reports"}	enterprise	{core}	{/analytics,/reports}	{/_app/analytics,/_app/reports}	t	2026-09-15 19:53:03.494041+00
audit	{"ar": "سجل تدقيق العمليات", "en": "Audit Logs Viewer"}	{"ar": "تتبع كل الحركات الإدارية والمالية مع تفاصيل المستخدم والوقت", "en": "View system audit trail and operational action logs"}	enterprise	{core}	{/audit}	{/_app/audit}	t	2026-09-15 19:53:03.494041+00
\.


--
-- Data for Name: platform_plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."platform_plans" ("id", "name", "description", "modules", "max_users", "max_warehouses", "max_products", "price_monthly", "is_active", "created_at") FROM stdin;
starter	{"ar": "الباقة الأساسية", "en": "Starter Plan"}	{"ar": "للأنشطة الصغيرة: مبيعات ومخزون مبسط ومستودع واحد", "en": "For small retail: single warehouse, basic sales and inventory"}	{core}	1	1	500	0.00	t	2026-09-15 19:53:03.494041+00
professional	{"ar": "الباقة الاحترافية", "en": "Professional Plan"}	{"ar": "للمتاجر المتنامية: نقطة بيع، مششتريات، تحصيلات ومصروفات", "en": "For growing retail: POS, purchases, returns, payments & expenses"}	{core,pos,purchases,returns,payments,expenses}	5	1	5000	29.00	t	2026-09-15 19:53:03.494041+00
enterprise	{"ar": "باقة المؤسسات المتكاملة", "en": "Enterprise Plan"}	{"ar": "نظام ERP كامل يشمل كافة الوحدات والمستودعات والمحاسبة والتحليلات", "en": "Full ERP suite with all modules, multi-warehouse, loyalty and accounting"}	{core,pos,purchases,returns,payments,expenses,multi_warehouse,barcode,loyalty,batches,advanced_accounting,analytics,audit}	50	20	\N	99.00	t	2026-09-15 19:53:03.494041+00
\.


--
-- Data for Name: product_batches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."product_batches" ("id", "product_id", "warehouse_id", "batch_number", "expiry_date", "quantity", "unit_cost", "note", "created_by", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: vehicle_makes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."vehicle_makes" ("id", "name", "name_ar") FROM stdin;
818f8b4e-b68e-417b-a518-fe71cd9b34d9	Yamaha	ياماها
c97352e2-1254-48b8-85a3-7040b379938c	Honda	هوندا
2d1b1f23-f8a3-475c-9289-b35565acf5cd	Suzuki	سوزوكي
1b666725-c182-4d58-8314-d01c7726400b	Hero	هيرو
1437c71f-3353-45f4-9d7a-f6a8b6775d50	ياباني مقلد جيفورد	ياباني مقلد جيفورد
7887ebc0-9046-4d30-94f3-c091a99d2eea	ياباني مقلد زوجن	ياباني مقلد زوجن
c259155a-f35a-4385-8ae1-da7eeb9877e1	ياباني مقلد المنيف	ياباني مقلد المنيف
6df5c4f0-dd45-4354-9389-f7964c0d40b1	ياباني مقلد رولكس	ياباني مقلد رولكس
84c5a22a-56a0-4c52-b066-7483a8c2e02d	صيني 150	صيني 150
31149a1f-ccbe-4161-bb2f-cf518bb7453e	صيني 200	صيني 200
7f46182f-4910-4a8a-93a5-0d1bdf47130c	صيني 250	صيني 250
3bbee745-9425-49f2-865a-2eda0f2b2148	ياباني 150	ياباني 150
98e75c4c-e7bc-47e1-974a-3a6c68b463e5	ياباني 125	ياباني 125
\.


--
-- Data for Name: vehicle_models; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."vehicle_models" ("id", "make_id", "name", "name_ar") FROM stdin;
b74f16b3-6093-4f3b-a9a9-2cb02b7c18bf	818f8b4e-b68e-417b-a518-fe71cd9b34d9	YBR 125	واي بي آر 125
ec8d78e0-651b-41e3-b9f1-303f32d5b2bc	818f8b4e-b68e-417b-a518-fe71cd9b34d9	FZ 150	اف زد 150
978e49dc-978c-4a3e-9b18-7041d6b10c9f	c97352e2-1254-48b8-85a3-7040b379938c	CG 125	سي جي 125
a077a0b4-67fe-4067-92a9-8053673f3349	c97352e2-1254-48b8-85a3-7040b379938c	CB 125F	سي بي 125 إف
712a371b-411a-4a0a-b5d6-bcc929312fa7	2d1b1f23-f8a3-475c-9289-b35565acf5cd	GD 110	جي دي 110
\.


--
-- Data for Name: product_compatibilities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."product_compatibilities" ("product_id", "vehicle_model_id") FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."profiles" ("id", "full_name", "avatar_url", "phone", "language", "theme", "created_at", "updated_at") FROM stdin;
a9d8394f-8572-40f2-baaf-78e63e4ba571	??????	\N	\N	en	dark	2026-09-11 21:25:38.577632+00	2026-09-11 21:25:38.577632+00
7ae4823c-0946-4765-96f9-881dbf42b316	عماد الجماعي	\N	\N	en	dark	2026-09-12 22:01:48.967368+00	2026-09-12 22:01:48.967368+00
ef8142de-d644-4bd6-aa37-5613b041e0ad	موسى - السوبر أدمن	\N	\N	ar	dark	2026-09-16 00:18:54.550876+00	2026-09-16 00:19:56.217835+00
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."suppliers" ("id", "name", "phone", "email", "address", "balance", "is_active", "created_at", "updated_at") FROM stdin;
82a34ae9-a43a-42d0-b227-ad9882085231	محمد الشنيني	780201010	\N	\N	0.00	t	2026-09-20 20:34:59.487985+00	2026-09-20 20:34:59.487985+00
\.


--
-- Data for Name: purchase_invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."purchase_invoices" ("id", "invoice_number", "supplier_id", "warehouse_id", "status", "subtotal", "discount", "tax", "total", "paid", "payment_method", "note", "created_by", "created_at", "updated_at") FROM stdin;
e3d1bef2-4d58-4c92-be2f-e2c74e6da94d	PO-202609-0008	82a34ae9-a43a-42d0-b227-ad9882085231	f00a0950-fc40-4801-ab3e-f158fdd9e091	paid	13900.00	0.00	0.00	13900.00	13900.00	bank_transfer	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:46:06.964973+00	2026-09-20 23:46:06.964973+00
\.


--
-- Data for Name: purchase_invoice_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."purchase_invoice_items" ("id", "invoice_id", "product_id", "quantity", "unit_cost", "discount", "tax", "total") FROM stdin;
1875a697-43ff-4b6a-90b3-b6b402c41ed8	e3d1bef2-4d58-4c92-be2f-e2c74e6da94d	a3a57d93-f8d3-4684-b12d-fba192bed3e5	1.000	3400.00	0.00	0.00	3400.00
03f442e2-5457-4c66-9e18-23eaa69e16f8	e3d1bef2-4d58-4c92-be2f-e2c74e6da94d	7b44581c-5033-4181-b336-4e2b20d9636f	1.000	10500.00	0.00	0.00	10500.00
\.


--
-- Data for Name: purchase_returns; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."purchase_returns" ("id", "return_number", "invoice_id", "supplier_id", "warehouse_id", "subtotal", "tax", "total", "refund_method", "note", "created_by", "created_at") FROM stdin;
\.


--
-- Data for Name: purchase_return_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."purchase_return_items" ("id", "return_id", "product_id", "quantity", "unit_cost", "tax", "total") FROM stdin;
\.


--
-- Data for Name: sales_invoice_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."sales_invoice_items" ("id", "invoice_id", "product_id", "quantity", "unit_price", "discount", "tax", "total", "description") FROM stdin;
2c646ec7-34d9-4b7a-a39e-76daf0252894	f87b66b8-9a03-4269-8377-02f9df4ea05b	84ac3f8f-2810-4825-8f72-dcfed72a50f3	1.000	1200.00	0.00	0.00	1200.00	\N
a0691740-2202-4139-a8e2-f71bdc71c808	3666e67a-f47b-404c-a6c4-54306a1be3f9	55b47be3-5025-4db9-957b-72092714f1c5	1.000	1000.00	0.00	0.00	1000.00	\N
df29175a-158e-499f-81d1-14ac477056ce	775efdc9-3492-4e7c-bf20-ca8cb4559a01	a7d95b08-0d2d-4509-b3e2-fc3bc62d98bf	1.000	1500.00	0.00	0.00	1500.00	\N
09710bc4-3a4f-4c0a-b2b9-3319b9572e8c	775efdc9-3492-4e7c-bf20-ca8cb4559a01	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	1.000	2200.00	0.00	0.00	2200.00	\N
bbfd8dbc-4853-49fa-95fa-378c107ebf39	8c8e674d-b7b5-4b5f-bb7d-650d91a45378	a7d95b08-0d2d-4509-b3e2-fc3bc62d98bf	1.000	1500.00	0.00	0.00	1500.00	\N
6a339343-952a-4285-a0ac-f35dca290081	b5255f7e-8776-46f4-ac39-f9bc64465517	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	1.000	2200.00	0.00	0.00	2200.00	\N
2d325ece-5567-43af-81fb-723038dc57d9	92c9ef18-e371-4ec6-ae41-ad67e38a87aa	c5998fef-4515-4465-a8cb-a9e96d543d51	1.000	500.00	0.00	0.00	500.00	\N
c3258cb9-dbe0-4f84-bb0b-a2cc6cf83a07	9174dd78-2d30-43eb-9142-c9769f9358ad	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	1.000	2200.00	0.00	0.00	2200.00	\N
e051657f-f9e7-4c8c-8679-0bbb5c7883e3	89caff9a-1d37-47bf-b020-1e61ad6dcf49	2c94f75f-ef17-4da1-9a21-6c3c8324c620	1.000	2000.00	0.00	0.00	2000.00	\N
db90e0cc-273b-4b5b-96f5-0aeb6da12859	16f1737d-9897-4dd7-aaa2-d65036946600	054c4d9c-89b0-4367-b349-34d4ef4858f6	1.000	500.00	0.00	0.00	500.00	\N
0bd93b48-dd39-4b3c-bdd2-1e2434a56d3f	16f1737d-9897-4dd7-aaa2-d65036946600	11ed1686-50e2-4b62-83ea-3f9ec7be1324	1.000	500.00	0.00	0.00	500.00	\N
87737f4f-bdb2-477a-a34f-8461f3af298e	16f1737d-9897-4dd7-aaa2-d65036946600	56f9f2bb-b171-40e9-86bb-28eab2504980	1.000	500.00	0.00	0.00	500.00	\N
4bc5a3b3-d9d3-4d60-97c2-c2c51ca6f085	16f1737d-9897-4dd7-aaa2-d65036946600	a04ba723-d012-4795-bfef-5f0930da384f	1.000	100.00	0.00	0.00	100.00	\N
2939a2a5-9167-46b7-aa8a-d8fa46840089	16f1737d-9897-4dd7-aaa2-d65036946600	ef8c2ba6-2961-4dc4-91a5-e4807ad8a02d	1.000	300.00	0.00	0.00	300.00	\N
52659c97-312a-4bf9-82f2-88ef558e5e1b	16f1737d-9897-4dd7-aaa2-d65036946600	fc6ea8ce-3aa2-471c-a638-5492f831e7e6	1.000	700.00	0.00	0.00	700.00	\N
88b14a53-62ed-4141-8241-d781e5a15f56	86f93f21-f27a-4b22-bfde-54d5ef19089e	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	1.000	2200.00	0.00	0.00	2200.00	\N
87d89d07-a2bf-4bab-9c98-2ae70aaad32b	58dad026-29bf-4006-97c9-b63649a2000d	78a50f8f-fe15-49d2-96c9-8603051aa1b9	1.000	1000.00	0.00	0.00	1000.00	\N
bebe4db7-800b-455d-8ad6-1fbdf7e00220	3944e543-a181-43e9-b349-52f2cd909e31	2ba0d702-dc5a-4cd2-a52b-4a90f0cec736	1.000	1500.00	0.00	0.00	1500.00	\N
477f1fe8-8998-4477-9ffe-717837b375a3	3944e543-a181-43e9-b349-52f2cd909e31	2e0d25da-8464-473c-a2ee-bf11cf9578e3	1.000	2000.00	0.00	0.00	2000.00	\N
27df2a42-3c85-4a10-a1b7-74f242c06d55	3944e543-a181-43e9-b349-52f2cd909e31	2f1b2410-06a9-4a81-a2f2-00b1116960e5	1.000	50.00	0.00	0.00	50.00	\N
77f8eab2-0f52-4142-ad95-79b4132bd7c9	3944e543-a181-43e9-b349-52f2cd909e31	357bbcd8-aad8-4310-a076-15742083bef3	2.000	1500.00	0.00	0.00	3000.00	\N
16829008-f953-4140-9a22-062057d68ea9	3944e543-a181-43e9-b349-52f2cd909e31	3cb56b14-6ea0-493f-a7dc-681134db5917	1.000	25.00	0.00	0.00	25.00	\N
d988f7c3-f971-490d-98c5-560bdd607670	3944e543-a181-43e9-b349-52f2cd909e31	7b44581c-5033-4181-b336-4e2b20d9636f	1.000	11000.00	0.00	0.00	11000.00	\N
7a3f947d-13a6-4860-a8bd-621c90abcea0	3944e543-a181-43e9-b349-52f2cd909e31	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	1.000	2200.00	0.00	0.00	2200.00	\N
38179e78-8c47-4cb0-8031-d969fb9d8ef4	3944e543-a181-43e9-b349-52f2cd909e31	e7134cfd-69b2-4a0a-aa3f-880b396de336	1.000	8000.00	0.00	0.00	8000.00	\N
39124bc6-4a32-4132-995b-d924f2808003	3944e543-a181-43e9-b349-52f2cd909e31	f81a2a25-a580-4add-a240-60e90d13b4c6	1.000	2500.00	0.00	0.00	2500.00	\N
099681f7-d746-479d-940f-ab37cb45c6ce	3944e543-a181-43e9-b349-52f2cd909e31	\N	1.000	2000.00	0.00	0.00	2000.00	حساب المهندس
8c418af5-b6ab-421c-91b3-dc20178e8063	83007bfb-ab57-474f-abcc-2d7a9e6127a1	e0fb09fc-c273-4d58-9423-87d353d807d1	2.000	500.00	0.00	0.00	1000.00	\N
3ee026dc-10b8-454c-b05a-83bd5b6fcd9a	3e4c3f63-1044-4314-8d0d-c68ed208d698	80e5f29e-e3ec-4293-bd3c-3a335ab2477d	1.000	750.00	0.00	0.00	750.00	\N
2ab27790-6dfd-4b6a-8268-56e68194c969	3e4c3f63-1044-4314-8d0d-c68ed208d698	e0fb09fc-c273-4d58-9423-87d353d807d1	2.000	500.00	0.00	0.00	1000.00	\N
ceac02a8-e7c1-4ad7-88c2-ef4f7ab0be74	9a2793db-9c35-49ac-b135-cf96c85f7362	4edd2a9a-bb4f-421a-a024-08b9ac789032	1.000	500.00	0.00	0.00	500.00	\N
0596db5f-de43-473d-ae47-b280996cb508	fd925239-b9a9-49a3-a794-9970ca9036a7	1a1f5209-6c9b-447e-a3f6-79262f62be61	1.000	5000.00	0.00	0.00	5000.00	\N
9595aa8d-36fb-44e5-bd2b-1731c73824f1	fd925239-b9a9-49a3-a794-9970ca9036a7	726f273b-fdf2-467d-abf3-8f71d714933b	1.000	3500.00	0.00	0.00	3500.00	\N
28df99d8-0de2-4aa5-b245-07abfcde4599	fd925239-b9a9-49a3-a794-9970ca9036a7	935c8c9b-bd0c-4a18-9cc4-605c4892bebd	1.000	300.00	0.00	0.00	300.00	\N
b47516fe-ee6d-409c-9507-7ccd172db37e	fd925239-b9a9-49a3-a794-9970ca9036a7	aaa13363-f4a7-4e83-a5d1-673b670324d7	1.000	200.00	0.00	0.00	200.00	\N
53a7fd1a-331b-4483-b9c0-1328b830e047	fd925239-b9a9-49a3-a794-9970ca9036a7	b031b84c-6601-4c0f-8097-1baef1482013	1.000	500.00	0.00	0.00	500.00	\N
4756a94d-9b63-48f4-a117-5e9bb3076772	fd925239-b9a9-49a3-a794-9970ca9036a7	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	1.000	2200.00	0.00	0.00	2200.00	\N
a61bbf0a-ea5c-4082-83aa-242860d75110	fd925239-b9a9-49a3-a794-9970ca9036a7	f1c8f589-b86a-41b6-be13-023b0748c644	1.000	300.00	0.00	0.00	300.00	\N
773a8fe2-95e0-4a9d-8ad8-63223827687f	97b0c3d9-5abb-4887-96de-723d651c0436	a7887b2b-34d2-45cb-9552-4938b2a803e5	1.000	2400.00	0.00	0.00	2400.00	\N
71d5fe96-c564-494b-b67e-efa82eac21ee	97b0c3d9-5abb-4887-96de-723d651c0436	b04b7f08-0b64-4552-821b-c3001daa6153	2.000	250.00	0.00	0.00	500.00	\N
af56d969-d264-4dea-8256-6b37b6a8e4d4	97b0c3d9-5abb-4887-96de-723d651c0436	e20967e2-77a4-4bc5-9bb5-b45b65858df4	1.000	100.00	0.00	0.00	100.00	\N
d3bca724-8b2a-4cb6-85e3-5b1a9268c4eb	6450f56e-fed2-4574-9099-912d55b30f02	f59d9d20-1a3a-4486-b831-29b46ab327a4	1.000	1000.00	0.00	0.00	1000.00	\N
6e957920-03bd-420f-bc8e-b0e369609e77	6aa9a0dd-0a22-468f-b711-980ad6c85d26	a7887b2b-34d2-45cb-9552-4938b2a803e5	1.000	2400.00	0.00	0.00	2400.00	\N
ada445b6-f83c-42e5-81ae-e3d67afff4b9	119f43b8-2150-4449-b525-b25e126e8519	1308cb1e-cc8c-4a85-ab6a-92ccf53883a3	1.000	100.00	0.00	0.00	100.00	\N
1d06a9ac-5efc-497c-9d98-d53fc15f39c3	119f43b8-2150-4449-b525-b25e126e8519	\N	1.000	3000.00	0.00	0.00	3000.00	مهندس
2062788e-4062-4425-aaac-3317c78a2f1b	148695ef-ff2b-49fc-848e-542cf947a9cc	1120add1-20c6-4ae5-a729-5c716708488f	1.000	6500.00	0.00	0.00	6500.00	\N
945547ea-65a5-4624-85ea-26b1cfea0d3f	148695ef-ff2b-49fc-848e-542cf947a9cc	1308cb1e-cc8c-4a85-ab6a-92ccf53883a3	1.000	100.00	0.00	0.00	100.00	\N
874e46fb-fbd6-4f8c-8a21-a4cad51b3b9c	148695ef-ff2b-49fc-848e-542cf947a9cc	1992e98c-4fbf-4210-82ad-91c8ca96a679	2.000	500.00	0.00	0.00	1000.00	\N
1578f7cb-60b8-4f55-8778-5387e88d821a	148695ef-ff2b-49fc-848e-542cf947a9cc	1ca11cda-7ca7-46b4-9c9d-85bcb6bbfb58	1.000	1000.00	0.00	0.00	1000.00	\N
5f16aec7-1e88-4878-a41a-f14fa8303e78	148695ef-ff2b-49fc-848e-542cf947a9cc	39b92f0d-f8c4-418c-a0ec-325a23be3970	1.000	100.00	0.00	0.00	100.00	\N
bb990936-7c86-4843-bf97-188da0f6a899	148695ef-ff2b-49fc-848e-542cf947a9cc	5738a4b5-aa2e-4325-b60b-d6d980dbc1fc	1.000	1250.00	0.00	0.00	1250.00	\N
eaf3525f-f9b6-455a-b25b-da0fdf678f55	148695ef-ff2b-49fc-848e-542cf947a9cc	661bdc39-9def-4ddd-96af-0d6d91d8af0e	4.000	100.00	0.00	0.00	400.00	\N
87f588c6-bfa1-40c7-bc08-5a95935ce876	148695ef-ff2b-49fc-848e-542cf947a9cc	95be6ea9-d2a1-4dbc-bd6d-a9bac27ca332	1.000	1250.00	0.00	0.00	1250.00	\N
2a8e7f88-6f34-4edc-990b-637dd8dff527	ccc02089-567e-4d2f-ab10-332437446517	28e27bd6-fa77-4fa4-b03e-e76abed1e884	1.000	500.00	0.00	0.00	500.00	\N
50c808e5-ca49-4212-8208-f1088c715550	ccc02089-567e-4d2f-ab10-332437446517	fb1df70f-6f73-40fe-89fa-bea2be5c2d87	1.000	500.00	0.00	0.00	500.00	\N
90ff9e3d-6173-4775-8a1c-6d220bba6ad9	7af64206-af9b-485f-a3e6-97a877675f24	3ffdfd69-4efd-43cb-9a13-ed72990890b2	1.000	300.00	0.00	0.00	300.00	\N
1db3988e-4c68-4457-9268-e12bcb7426dd	7af64206-af9b-485f-a3e6-97a877675f24	\N	1.000	1500.00	0.00	0.00	1500.00	مهندس
26b1c9b1-e694-493d-b5b9-e7b5dcee7639	50d9f6fa-dbc2-47a4-b478-4a56d6f12218	88b84530-e118-48a2-b54b-c60684c7b68d	1.000	500.00	0.00	0.00	500.00	\N
1210966d-7a43-41fb-8311-db651d606238	a2def70e-e60f-47e0-b452-e2d91e282bac	80e5f29e-e3ec-4293-bd3c-3a335ab2477d	1.000	750.00	0.00	0.00	750.00	\N
f1433c74-2231-4196-acd0-ba5ea4b74840	0fba8446-b96b-44a9-9b73-a038e24d47cc	e20967e2-77a4-4bc5-9bb5-b45b65858df4	1.000	100.00	0.00	0.00	100.00	\N
d5697e60-1862-419f-afa5-e1eb927db95f	d5777c1d-cac0-451d-923e-111f0224e3a1	126163e3-d64d-4473-bea2-2e8e8aec129a	1.000	700.00	0.00	0.00	700.00	\N
0f25ce8c-0b27-45fc-aeeb-8f8b7f28425a	d5777c1d-cac0-451d-923e-111f0224e3a1	8f38bd22-1abf-4689-b78b-13ba2703b0ad	1.000	4000.00	0.00	0.00	4000.00	\N
56f27042-49d2-48f6-8e59-b89758f79b1a	949ccda8-4a68-4d24-bd0e-77d6c8e88ab0	08392996-e913-4f1f-9518-ba1a17b274af	1.000	500.00	0.00	0.00	500.00	\N
e60c8bc9-b2bf-4df2-ad65-48181a3939f8	949ccda8-4a68-4d24-bd0e-77d6c8e88ab0	126163e3-d64d-4473-bea2-2e8e8aec129a	1.000	700.00	0.00	0.00	700.00	\N
982df5c8-1903-4662-a2ae-8c95404aaab3	c763f24a-fdb5-440a-9297-a76ec90f52dd	c83448c4-85bb-4d60-bd71-ba86fe643d10	1.000	200.00	0.00	0.00	200.00	\N
f679e5fb-aff1-429d-a91e-6480d57bddeb	9daa8e11-32b0-4931-991a-ed9ab7b40f13	3cb56b14-6ea0-493f-a7dc-681134db5917	1.000	50.00	0.00	0.00	50.00	\N
0511034f-cb41-4974-88d2-cf887dd41271	5bcfb8a0-057d-491b-9028-6c5155bed1fb	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	1.000	2200.00	0.00	0.00	2200.00	\N
9d0613a2-7aa9-4871-a384-4a127451b31f	84977fd4-01f7-42d8-964b-7f555f2fc53a	ead6e7a8-0fde-4717-bd4b-65fa0f59a35c	1.000	1200.00	0.00	0.00	1200.00	\N
357fb8f6-0924-4a87-b061-30d719791a06	651c336c-a3a7-4701-b66c-497a12f68a19	a067aa3b-ed5c-421f-ad43-992b8daf5af2	1.000	400.00	0.00	0.00	400.00	\N
0fd8f953-0d20-408a-b4c8-068d57b333b5	f7135022-c484-4a9f-83c3-6a4012598d7b	050d2592-c49a-47fc-a43f-810632c9dac9	1.000	1500.00	0.00	0.00	1500.00	\N
08022252-45d5-41a9-9f8f-8d2db42c8442	f7135022-c484-4a9f-83c3-6a4012598d7b	fb1df70f-6f73-40fe-89fa-bea2be5c2d87	1.000	500.00	0.00	0.00	500.00	\N
84d31fa2-9528-4090-bd42-e6ef4ac237f4	9f20be45-8c79-42e6-9b35-46168a4711c8	02ec7152-406f-4ff1-bbfc-24db0fc1cd3c	1.000	700.00	0.00	0.00	700.00	\N
70e61b7e-2147-4dce-a447-204920392e74	4d947441-fbce-42f3-9b3c-c58b7a9fc0f9	0194a362-4c41-4ab4-90a0-1b863931747e	2.000	500.00	0.00	0.00	1000.00	\N
7b114796-6291-45a8-b0f0-e37a62889b48	4d947441-fbce-42f3-9b3c-c58b7a9fc0f9	4be22fbe-0616-45ff-8dae-103a8d7613e8	1.000	1000.00	0.00	0.00	1000.00	\N
cb1b2ac6-64a7-4d41-bea9-9cd081473ddd	4d947441-fbce-42f3-9b3c-c58b7a9fc0f9	d3dd2adc-6df9-47f0-86af-1b868070f219	1.000	1000.00	0.00	0.00	1000.00	\N
59c88c3c-684c-456e-acd1-b62578400ea4	82208862-b457-4b98-ba00-d1c0957026c0	4af0ad25-987f-4628-ac91-13467f10238c	1.000	500.00	0.00	0.00	500.00	\N
47f17374-52f3-4cb0-b657-8a915d382ea0	82208862-b457-4b98-ba00-d1c0957026c0	d3dd2adc-6df9-47f0-86af-1b868070f219	1.000	1000.00	0.00	0.00	1000.00	\N
f2aa2a26-9fd5-444b-a0f6-a1ef6be56261	a9c8fdbe-6f36-4e1e-86e3-d5451c2040e7	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	1.000	2200.00	0.00	0.00	2200.00	\N
7436f5ad-19bc-4def-8439-85a8900dba4d	c03e0411-99c6-42ac-a461-93c77aae785f	1a1f5209-6c9b-447e-a3f6-79262f62be61	1.000	5000.00	0.00	0.00	5000.00	\N
2e5461a9-544c-452d-ad3d-280f491d8412	c03e0411-99c6-42ac-a461-93c77aae785f	6b97b2f4-dac6-4e92-bd5a-a01ea8b73b13	1.000	1000.00	0.00	0.00	1000.00	\N
963235cd-823a-4602-bad1-900a74a8869e	c03e0411-99c6-42ac-a461-93c77aae785f	726f273b-fdf2-467d-abf3-8f71d714933b	1.000	3500.00	0.00	0.00	3500.00	\N
e654479b-6ae7-4ef9-bc5e-b13acc5369d8	c03e0411-99c6-42ac-a461-93c77aae785f	b031b84c-6601-4c0f-8097-1baef1482013	1.000	500.00	0.00	0.00	500.00	\N
ece157b1-4625-41d5-86d1-026af712316e	c03e0411-99c6-42ac-a461-93c77aae785f	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	1.000	2200.00	0.00	0.00	2200.00	\N
9df21e8e-120d-4024-b9c4-3180b0ab3c6e	c03e0411-99c6-42ac-a461-93c77aae785f	\N	1.000	6000.00	0.00	0.00	6000.00	مهندس
9cd75e43-389b-46e5-a118-d07127041ce3	ad7f0c70-9483-4c37-b432-3833ae527e71	09d0d848-423d-426a-98a7-2c95e4738540	1.000	500.00	0.00	0.00	500.00	\N
64fa9fbf-0669-4bcb-876c-de60740f62b1	ad7f0c70-9483-4c37-b432-3833ae527e71	d3dd2adc-6df9-47f0-86af-1b868070f219	1.000	1000.00	0.00	0.00	1000.00	\N
bdc5ea36-c1a9-447d-b54c-fed53babf87a	ad7f0c70-9483-4c37-b432-3833ae527e71	\N	1.000	200.00	0.00	0.00	200.00	سم بريك
f5e862aa-7132-4f41-a3ba-b2c65f084481	1561993d-8a53-457c-ac24-818e08715012	341d5503-de65-4b36-96d6-7e18b0d72e20	1.000	1500.00	0.00	0.00	1500.00	\N
bc1490d3-e697-4f54-954a-b99e98ec951d	1561993d-8a53-457c-ac24-818e08715012	4207f0a5-a4d4-4989-921b-5a68b445b0d1	1.000	200.00	0.00	0.00	200.00	\N
418b80c4-b931-4dc8-b4bd-3a409582aa99	1561993d-8a53-457c-ac24-818e08715012	bec3baa6-b867-4560-97a8-3c800e2fdf98	1.000	2000.00	0.00	0.00	2000.00	\N
d44e6ba8-10cb-4f66-8d19-1b4c3baba252	16c8666f-1286-4e7b-bc0f-314732bdfe8d	79ce9af2-7485-4824-869f-2d318f916878	1.000	500.00	0.00	0.00	500.00	\N
0ddd9e3e-27fc-45cd-843b-eb2855141c09	11956f6d-d1c1-407a-81cd-cb36778b0a43	cecc9d0f-4342-4591-8553-dbaffe71b588	1.000	500.00	0.00	0.00	500.00	\N
421d26f2-0fb4-4718-84a8-43658e011aac	5ac65b05-f223-452c-a894-cdb6ae4088b4	db0d815e-1ca4-42ca-bc0d-8096bb65ec24	1.000	2500.00	0.00	0.00	2500.00	\N
b3c721c2-9cfb-4408-bef4-c335dd32b3e9	8c604b7b-6e82-47ba-acf5-9a83d23d5048	9a33c016-39c3-459b-abb4-86e89ca804b8	1.000	1500.00	0.00	0.00	1500.00	\N
2566d97b-76fc-4f6c-b45c-335523fd060f	0fa302ac-710a-474c-8b0b-32564f1a3e07	0194a362-4c41-4ab4-90a0-1b863931747e	2.000	500.00	0.00	0.00	1000.00	\N
055e8a97-0b2f-451f-a131-b7fdc1b33dec	718c0a4c-b156-42e7-8996-794036b8d95d	3b27463d-dcfa-460a-9bef-9415cce5f42a	1.000	500.00	0.00	0.00	500.00	\N
87a778e1-792c-4cb0-a6f6-246bd675fcca	c97c98c9-578f-4776-96be-4b145c297a33	be2bade7-b8d5-43e3-bf9f-7d469fc94e82	1.000	500.00	0.00	0.00	500.00	\N
7df906f1-cc56-4d27-bbca-b2750a5e92c1	904a49bb-a1b4-49cb-bf46-d3400cb02529	26e8d8d0-32ac-4abb-a5be-46766973051a	1.000	500.00	0.00	0.00	500.00	\N
67616088-479b-438d-8d10-558e58c2a841	cfd69f6c-98c1-4090-95ed-664c0c4fccee	341d5503-de65-4b36-96d6-7e18b0d72e20	1.000	1500.00	0.00	0.00	1500.00	\N
6a832189-9c49-4229-87a5-b61eb765477b	20bab1ce-e0be-4fdd-8601-dd514803b7c3	09d0d848-423d-426a-98a7-2c95e4738540	1.000	500.00	0.00	0.00	500.00	\N
bcd3e732-371d-49a2-a0cd-610cbf566f46	9067bcb6-8f83-431f-8a3f-60421ef09368	e0fb09fc-c273-4d58-9423-87d353d807d1	2.000	500.00	0.00	0.00	1000.00	\N
13f7edeb-204b-4565-b148-f3ca2dac34c9	2cfc3dae-c39e-475a-8309-29cbbc4f4f83	09d0d848-423d-426a-98a7-2c95e4738540	1.000	500.00	0.00	0.00	500.00	\N
e5623da5-8b62-458d-923d-f2e54ab52da4	73e18190-dcf3-4cc2-9b83-8f7a8135d44b	2f57de48-5426-4618-9b0a-a87fb9b00b0d	1.000	300.00	0.00	0.00	300.00	\N
c0783b50-ac3a-4190-940c-a0c46bcbb768	fab81270-7b8d-402f-ad27-924693cb832a	2f57de48-5426-4618-9b0a-a87fb9b00b0d	1.000	300.00	0.00	0.00	300.00	\N
4416d58d-5044-4d29-a7f3-390851dac095	801dfada-018f-4be1-9f20-3e9ffa07c1ca	09d0d848-423d-426a-98a7-2c95e4738540	1.000	500.00	0.00	0.00	500.00	\N
85d12d5d-f5b8-45c4-957d-204525f2469a	af31a2e9-d36c-4730-92c4-67587988ea00	f59d9d20-1a3a-4486-b831-29b46ab327a4	1.000	1000.00	0.00	0.00	1000.00	\N
e7d4ff21-0a4d-4039-9677-dad5b7f42367	191c0e01-612f-4a86-a4f3-0653c833521d	58dcb1ba-bd63-441a-a2a4-95ad38d0870e	2.000	1000.00	0.00	0.00	2000.00	\N
b558269d-eaf8-4dbe-8eed-d478fd4d1468	e22754e2-3fc4-4c1b-958c-e126b2303ceb	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	1.000	2200.00	0.00	0.00	2200.00	\N
164555d3-ba96-47ef-8210-e72e818c5fa4	ba3b2d6a-eb75-4bf4-b6e4-91ee84502572	08bae2b8-58ae-46a3-a30e-aaae2c33c4ab	1.000	2000.00	0.00	0.00	2000.00	\N
b663bef9-4dec-42de-a2c4-1c8f1f530c5b	26c73e6e-eb4f-4264-97dd-10112a497ee6	3e68ec96-b5ed-4d7b-856b-570a51e12463	1.000	5000.00	0.00	0.00	5000.00	\N
1a7066fa-d3aa-455d-8482-710e4874b639	26c73e6e-eb4f-4264-97dd-10112a497ee6	88b84530-e118-48a2-b54b-c60684c7b68d	1.000	500.00	0.00	0.00	500.00	\N
bf469170-d016-4ed9-bdb2-238e133b1250	26c73e6e-eb4f-4264-97dd-10112a497ee6	8d82cbd4-6995-46f4-9591-7968c4a572d4	1.000	100.00	0.00	0.00	100.00	\N
cf207e3f-4f54-4ced-bc4d-2b1d52f4630b	26c73e6e-eb4f-4264-97dd-10112a497ee6	9ed1022c-9015-4165-aace-fbd3a371f5b9	1.000	2400.00	0.00	0.00	2400.00	\N
a882ac18-a61c-4200-a0ad-4aca0dabd26b	26c73e6e-eb4f-4264-97dd-10112a497ee6	e20967e2-77a4-4bc5-9bb5-b45b65858df4	1.000	100.00	0.00	0.00	100.00	\N
40ea9b31-d6ad-4043-88eb-5a38dda08ed9	26c73e6e-eb4f-4264-97dd-10112a497ee6	ec2ae3b7-98b2-4ad8-9b8b-7c6a359144c0	1.000	3500.00	0.00	0.00	3500.00	\N
7d8cacd8-bb99-4cd0-a7a5-6842af979902	09cbdb00-4ede-4859-94af-ef10a2d109b6	e0fb09fc-c273-4d58-9423-87d353d807d1	1.000	500.00	0.00	0.00	500.00	\N
cb7e5cf5-8dd2-4b9b-9bff-336b95be4b8e	79b7e6e0-3852-4ddd-b621-066c5e43453c	08bae2b8-58ae-46a3-a30e-aaae2c33c4ab	1.000	2000.00	0.00	0.00	2000.00	\N
bd37956e-3ac8-4cf0-92f8-7bef85ecef13	c63b4728-ffc8-43aa-8a76-107d0ad0937e	11ed1686-50e2-4b62-83ea-3f9ec7be1324	1.000	500.00	0.00	0.00	500.00	\N
5f8abb93-25d4-4efe-b8c7-1ffc492d500b	029552cf-ab19-431c-ae9d-e5c462b4372c	4333bfd6-0bd3-44cb-8eca-01c380e70a09	1.000	1000.00	0.00	0.00	1000.00	\N
7bdaa129-9144-4f19-b993-dd506a0cf9ee	029552cf-ab19-431c-ae9d-e5c462b4372c	4bc66865-1f22-4dd0-8cea-375f3088550d	1.000	700.00	0.00	0.00	700.00	\N
2311e3db-91f5-4ca8-978d-21d62cc6f7a7	029552cf-ab19-431c-ae9d-e5c462b4372c	964387a5-0a14-450d-bcbf-a251477f441d	1.000	1000.00	0.00	0.00	1000.00	\N
c24b35ee-c5b1-4641-a2a6-59554fd4410c	318ae0d4-7784-4bfa-bc71-6724175d7777	80e5f29e-e3ec-4293-bd3c-3a335ab2477d	1.000	750.00	0.00	0.00	750.00	\N
3099f157-7bc3-4dde-94ec-2b027a1d41a7	73f4e1c9-1121-487b-a2df-7f65d021182b	d3dd2adc-6df9-47f0-86af-1b868070f219	1.000	1000.00	0.00	0.00	1000.00	\N
2256dc6a-7896-4b9e-ba83-b37f4f656be2	59ba7786-c59b-4431-afed-5ce6f203e47f	d3dd2adc-6df9-47f0-86af-1b868070f219	1.000	1000.00	0.00	0.00	1000.00	\N
5cc84e61-d6d9-4138-a238-6367cc904cd7	7123ae3c-082f-4341-afd1-ae7529e9287f	d3dd2adc-6df9-47f0-86af-1b868070f219	1.000	1000.00	0.00	0.00	1000.00	\N
c5f692c9-8c74-4d82-a754-b4a01c28c491	3e10769d-911d-4655-87b9-bd2e2d8513d3	66658002-0da1-416c-bbcd-c6ce034ab1dd	1.000	2500.00	0.00	0.00	2500.00	\N
e3dc3a8a-70b0-4941-8314-f8e0166aa172	c20a66af-e213-46db-ad3a-b6e05e8b1122	11ed1686-50e2-4b62-83ea-3f9ec7be1324	1.000	500.00	0.00	0.00	500.00	\N
2b4e2cd3-a2b9-416a-8e15-d23a9b7ffeba	c20a66af-e213-46db-ad3a-b6e05e8b1122	c802adac-afc2-445b-9fdb-b02336c37644	1.000	500.00	0.00	0.00	500.00	\N
adf7e7ad-0e3b-48bd-9a7a-f0574326fef4	c20a66af-e213-46db-ad3a-b6e05e8b1122	d3dd2adc-6df9-47f0-86af-1b868070f219	1.000	1000.00	0.00	0.00	1000.00	\N
59dd9aeb-f283-479f-a052-3a46a717d5ae	0d4944a7-e624-43f3-b18f-2f39c4cde821	7afca9de-fc1c-45dd-9d8f-39f5b1b76266	1.000	1500.00	0.00	0.00	1500.00	\N
d55b59c2-ea49-450a-b10a-b993d46e3b2a	0d4944a7-e624-43f3-b18f-2f39c4cde821	fa4db2cb-96ee-4b13-a939-fdebaf508553	1.000	100.00	0.00	0.00	100.00	\N
610cf44d-b0c6-41f3-be24-6172b57b5cd2	c2b6e55d-800b-4d16-9d93-3f5607322e6e	aa31fd37-7e24-4c2d-9e48-3c0e4c989db5	1.000	1000.00	0.00	0.00	1000.00	\N
c26e0b7a-bbe8-427f-833a-b6d04ebfe8ac	25528fa8-5626-40bd-b4bf-1956bed54498	1ca11cda-7ca7-46b4-9c9d-85bcb6bbfb58	1.000	1000.00	0.00	0.00	1000.00	\N
401579af-522f-4ae5-9e18-b3ebe89b86fd	7ed64f6d-fe92-426f-a703-062fbad58129	1ca11cda-7ca7-46b4-9c9d-85bcb6bbfb58	1.000	1000.00	0.00	0.00	1000.00	\N
5d76c7fe-b187-4e99-9865-ec3157788c5c	7673095d-0a09-42be-af97-b4821bb0f9bc	1ca11cda-7ca7-46b4-9c9d-85bcb6bbfb58	1.000	1000.00	0.00	0.00	1000.00	\N
b56bdc7d-98ff-42d9-b53c-04c5f3760e42	8a3b47e1-e835-41c8-9fc2-e6220b9b684d	09d0d848-423d-426a-98a7-2c95e4738540	1.000	500.00	0.00	0.00	500.00	\N
1cb836da-f02f-4dd8-8d36-3f13925c998c	8a3b47e1-e835-41c8-9fc2-e6220b9b684d	d3dd2adc-6df9-47f0-86af-1b868070f219	1.000	1000.00	0.00	0.00	1000.00	\N
55c02bd2-36a9-4f38-8b26-b2303a2095de	8314365f-2c0e-4bb1-b35c-6013754d0e3c	28e27bd6-fa77-4fa4-b03e-e76abed1e884	1.000	500.00	0.00	0.00	500.00	\N
c876fa26-6fbc-440d-b77e-01411cdce05e	fd7d4d6f-1b50-4bb4-9a65-1959f7a8a065	80e5f29e-e3ec-4293-bd3c-3a335ab2477d	1.000	750.00	0.00	0.00	750.00	\N
f1b56948-0360-46d5-801b-453c01066b64	fd7d4d6f-1b50-4bb4-9a65-1959f7a8a065	d3dd2adc-6df9-47f0-86af-1b868070f219	1.000	1000.00	0.00	0.00	1000.00	\N
502b3cfc-5130-4687-ac08-7abbfb2dd909	39ce96b4-ec0b-43af-bbc9-ff514e7096d2	341d5503-de65-4b36-96d6-7e18b0d72e20	1.000	1500.00	0.00	0.00	1500.00	\N
4647a8cf-0488-45e2-9535-38b0e5e6588d	13d833bf-addd-431c-8af9-760bb0229f2f	68530644-1472-4fa9-84c0-e82aa848ff0c	1.000	500.00	0.00	0.00	500.00	\N
42914726-c35c-4627-b2c8-edee2d8e4761	2b28aba0-a869-4942-883c-fc5fbb64fa74	050d2592-c49a-47fc-a43f-810632c9dac9	1.000	1500.00	0.00	0.00	1500.00	\N
848e1e7c-a6a4-440d-8251-c7fc550f43d8	70b03851-5bcb-4462-bba1-201f5ff596f8	22f584dc-9914-48b1-98d2-2e7890e3fad2	1.000	500.00	0.00	0.00	500.00	\N
88ef36ae-a3b4-4012-9724-85be9a323ebd	70b03851-5bcb-4462-bba1-201f5ff596f8	2c94f75f-ef17-4da1-9a21-6c3c8324c620	1.000	2000.00	0.00	0.00	2000.00	\N
e8637cab-5004-44f1-9771-4c0e2323b2e1	70b03851-5bcb-4462-bba1-201f5ff596f8	9922e1aa-c67f-4007-a093-8528fd89e4f1	1.000	1250.00	0.00	0.00	1250.00	\N
2086e918-f5e7-4ebf-b0b9-ec52ebe89445	70b03851-5bcb-4462-bba1-201f5ff596f8	9d116d69-0484-41d4-8b27-f169134c764d	1.000	500.00	0.00	0.00	500.00	\N
7ead200e-da5e-433d-a0d5-407a5d8eb948	70b03851-5bcb-4462-bba1-201f5ff596f8	d3dd2adc-6df9-47f0-86af-1b868070f219	1.000	1000.00	0.00	0.00	1000.00	\N
1e2aa43e-81d4-4ac8-9a8a-140a3403f471	70b03851-5bcb-4462-bba1-201f5ff596f8	fb1df70f-6f73-40fe-89fa-bea2be5c2d87	1.000	500.00	0.00	0.00	500.00	\N
4f1f31e7-cfdb-4a44-9616-e01dd4bc2dd6	75e359bf-4c3a-4b09-9f50-0d3c1181bc5e	08bae2b8-58ae-46a3-a30e-aaae2c33c4ab	1.000	2000.00	0.00	0.00	2000.00	\N
c52a46dc-7747-404b-9942-da7893b60998	4c1899ec-0474-46d0-8ae7-efc9b0310ac1	bd9ec08a-349d-44c6-9252-ad448e76ce8b	1.000	1500.00	0.00	0.00	1500.00	\N
4c0c3541-088b-4971-937b-f15c906808fc	ba3878af-0166-4cf5-9621-754aeb74773b	17cb9df6-89f3-47f5-a2f6-c105aa579aae	1.000	5000.00	0.00	0.00	5000.00	\N
\.


--
-- Data for Name: sales_returns; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."sales_returns" ("id", "return_number", "invoice_id", "customer_id", "warehouse_id", "subtotal", "tax", "total", "refund_method", "note", "created_by", "created_at") FROM stdin;
209c2fd6-86d1-481e-ac4f-6f9e8817d87c	SR-202609-0008	\N	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	1500	0.00000000000000000000	1500.00000000000000000000	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 17:02:17.577691+00
afbcc33c-cc59-4bad-9aae-2d48d8325273	SR-202609-0009	\N	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	2200	0.00000000000000000000	2200.00000000000000000000	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:54:39.505396+00
c71ddb5f-c037-4fca-8322-40d51c400a49	SR-202609-0010	\N	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	1000	0.00000000000000000000	1000.00000000000000000000	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:10:04.332592+00
df478022-4ae2-442a-8027-d649683775f1	SR-202609-0011	\N	\N	f00a0950-fc40-4801-ab3e-f158fdd9e091	700	0.00000000000000000000	700.00000000000000000000	cash	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:03:10.811537+00
\.


--
-- Data for Name: sales_return_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."sales_return_items" ("id", "return_id", "product_id", "quantity", "unit_price", "tax", "total") FROM stdin;
92b42005-f047-401e-be19-eae5df320a5a	209c2fd6-86d1-481e-ac4f-6f9e8817d87c	a7d95b08-0d2d-4509-b3e2-fc3bc62d98bf	1	1500	0.00000000000000000000	1500.00000000000000000000
e8c6f4fd-c0bc-497c-b87a-0dd5867f3023	afbcc33c-cc59-4bad-9aae-2d48d8325273	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	1	2200	0.00000000000000000000	2200.00000000000000000000
df4320c2-9ded-4bdc-97cb-4ae6af382022	c71ddb5f-c037-4fca-8322-40d51c400a49	f59d9d20-1a3a-4486-b831-29b46ab327a4	1	1000	0.00000000000000000000	1000.00000000000000000000
546a4d7f-3b14-4231-b505-7fdee0c3d409	df478022-4ae2-442a-8027-d649683775f1	4bc66865-1f22-4dd0-8cea-375f3088550d	1	700	0.00000000000000000000	700.00000000000000000000
\.


--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."stock_movements" ("id", "product_id", "warehouse_id", "movement_type", "quantity", "unit_cost", "reference", "note", "created_by", "created_at", "reference_type", "reference_id") FROM stdin;
13f6215c-ec03-4dbd-86fa-2fcf6c30e5d2	55b47be3-5025-4db9-957b-72092714f1c5	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-19 13:29:44.280304+00	sale	3666e67a-f47b-404c-a6c4-54306a1be3f9
68fe0fa7-3b90-42d0-ad40-ffe928a3e5cc	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	9.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 14:54:29.752446+00	\N	\N
584804bc-1272-48bb-845b-f411306f3a1e	a7887b2b-34d2-45cb-9552-4938b2a803e5	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	19.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 14:59:32.126795+00	\N	\N
44ba69c1-4b10-4669-865d-2c2fb1f43727	b1aaa196-503a-4f34-9c59-467c768967c5	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	11.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:01:18.92291+00	\N	\N
9ecf679c-8e56-4b28-9161-43a9fa943126	6cfe29ff-540e-4ec5-a7d4-ad334ba32128	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:04:05.632993+00	\N	\N
6f7fca3c-942a-4fc9-a9c6-220e7e15824a	e6a8f397-e3e0-4917-bd53-fcfecc5f84c2	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:05:47.041538+00	\N	\N
0ba966e0-6fbf-421b-9f3c-383788f2305a	4344e543-5c9f-486d-b18d-342fa1cda47c	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:13:35.278545+00	\N	\N
29481e15-a7d2-4fa2-9037-e7705a41428c	05fa1424-9537-454d-832a-d48d708c4e31	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:13:50.354246+00	\N	\N
481ce547-54ca-42b6-a551-a9ee4a903642	8cbee3db-8535-4deb-97e9-49c258a8405e	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:14:07.907124+00	\N	\N
861f73be-e103-432c-aa92-e00aea6e024d	1137edf8-accd-40a6-b7ee-6d64c815caf1	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:14:23.745458+00	\N	\N
922f32b3-8030-4d58-a7ac-aa3a0cdb178e	2af9ddc8-4b0d-4044-8811-3dec3afd2816	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	6.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:14:33.579415+00	\N	\N
6c19946e-d4e6-48f7-bc32-2fb17673bcaa	17e298c1-347f-4d83-bfa4-0e4ed5d1f7b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	22.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:17:06.351566+00	\N	\N
7118eff2-5082-4a07-8c77-3840984e531a	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	24.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:28:51.489414+00	\N	\N
cf20ba6b-3214-480a-b644-c035ba524950	896a5461-677a-4fc6-ac93-d3314cbfd684	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:29:06.833353+00	\N	\N
66fc3d90-7c00-43f5-95eb-55d6a4d5b56e	84ac3f8f-2810-4825-8f72-dcfed72a50f3	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-19 13:26:19.603398+00	\N	\N
2e09c9d8-acf2-43c5-9301-807dd1629f8a	84ac3f8f-2810-4825-8f72-dcfed72a50f3	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1000.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-19 13:28:55.094964+00	sale	f87b66b8-9a03-4269-8377-02f9df4ea05b
f16b01fd-722b-4c99-8cc3-ffb72add7418	55b47be3-5025-4db9-957b-72092714f1c5	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-19 13:29:18.97109+00	\N	\N
85d66ba1-15c7-4ec0-ade3-24cf0160253d	5d186234-03f8-4cf9-b526-f82d6b949076	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 15:31:28.51309+00	\N	\N
27e1bada-fdc3-44f0-b53a-865280b2eeaf	fe6f7096-f14d-450d-a17f-5fdcc77b27e4	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	7.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:43:29.823383+00	\N	\N
4e8ce637-42cd-4d3c-883a-8438418d4e27	a7d95b08-0d2d-4509-b3e2-fc3bc62d98bf	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	6.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:52:53.538996+00	\N	\N
97d012a4-2ac4-416d-8705-a8db5e28b95e	a7d95b08-0d2d-4509-b3e2-fc3bc62d98bf	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:53:48.521228+00	sale	775efdc9-3492-4e7c-bf20-ca8cb4559a01
d6e720f9-7cf9-4463-810a-438f48dece16	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2100.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:53:48.521228+00	sale	775efdc9-3492-4e7c-bf20-ca8cb4559a01
27b22acd-4b2f-4721-938a-c4623f28008b	973e483c-4297-4bdf-b4de-eb08fa04b5e0	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	13.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:55:54.293806+00	\N	\N
88e74e74-8c72-4573-a93e-0f6881f94b28	8496eb74-7492-43e9-bb4c-6113510f6c70	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:56:24.502597+00	\N	\N
ea74d1b4-3cec-4c01-acab-0b0be8389a7d	a9375d9c-b63b-4c96-af97-0e2873ddb8c1	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:56:59.739906+00	\N	\N
3616ab8b-9531-4411-8dd8-124f60e65399	df95b4b1-969d-42c3-88cd-acc98cfc5d9e	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:57:21.516589+00	\N	\N
1e7e95c6-91ec-4e3e-bf44-96102c7dccb8	3f0e3cf3-985e-40a7-a1c7-8b6a03f98a5b	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:58:16.443151+00	\N	\N
67398658-a157-4f56-98cf-1071fbd60056	00061a71-6aa0-4498-89a8-6ddce3edf098	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:58:41.633059+00	\N	\N
4adae777-608d-43bf-b166-9e86bef3d0a7	e4e83290-3491-489e-8c81-5a4e0e8cce21	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 16:59:12.801669+00	\N	\N
9ffe1e62-c6fc-443c-9830-56bccbe072ad	a7d95b08-0d2d-4509-b3e2-fc3bc62d98bf	f00a0950-fc40-4801-ab3e-f158fdd9e091	return_in	1.000	1500.00	\N	Sales return	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 17:02:17.577691+00	sales_return	209c2fd6-86d1-481e-ac4f-6f9e8817d87c
ba4a2e2c-c878-49d6-b3e9-b8517dee61cb	a7d95b08-0d2d-4509-b3e2-fc3bc62d98bf	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 17:06:11.582872+00	sale	8c8e674d-b7b5-4b5f-bb7d-650d91a45378
24f66235-d24b-48f6-aafc-2d976cad43e4	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2100.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 17:18:56.842415+00	sale	b5255f7e-8776-46f4-ac39-f9bc64465517
b8d68d14-39a1-48ef-a807-6fec1da7df1e	e20967e2-77a4-4bc5-9bb5-b45b65858df4	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	62.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 17:45:23.696047+00	\N	\N
02671527-bfcf-4c4c-a695-3635182c0496	fa4db2cb-96ee-4b13-a939-fdebaf508553	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	58.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 18:09:28.133225+00	\N	\N
c3a99e12-5e1b-457f-a95f-cfb94e0b425f	c5998fef-4515-4465-a8cb-a9e96d543d51	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	11.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 18:26:41.449633+00	\N	\N
6e78937b-6f9b-4570-b4b7-1b1f96f1a13c	c5998fef-4515-4465-a8cb-a9e96d543d51	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 18:27:09.565503+00	sale	92c9ef18-e371-4ec6-ae41-ad67e38a87aa
9851d49b-91e4-4cb6-963e-f4a0df2368a7	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2100.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 18:44:33.528892+00	sale	9174dd78-2d30-43eb-9142-c9769f9358ad
389def52-f556-448b-b397-e281394887e1	2c94f75f-ef17-4da1-9a21-6c3c8324c620	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:18:17.789535+00	\N	\N
ccd2e65e-3a1b-4626-a1bb-ee4aa617c3be	2c94f75f-ef17-4da1-9a21-6c3c8324c620	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:18:38.189463+00	sale	89caff9a-1d37-47bf-b020-1e61ad6dcf49
6bfd0384-9da6-4a12-a79a-66ff8809487c	11ed1686-50e2-4b62-83ea-3f9ec7be1324	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	27.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:24:35.252772+00	\N	\N
3fb5ac22-f7a9-43ba-a4e3-73806a5a3448	56f9f2bb-b171-40e9-86bb-28eab2504980	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:24:55.184211+00	\N	\N
7a1eddf5-0a9a-4d4f-aad8-b65995f53906	054c4d9c-89b0-4367-b349-34d4ef4858f6	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:25:02.814166+00	\N	\N
8f041403-932c-4f75-8efe-de1b8f9c4222	ef8c2ba6-2961-4dc4-91a5-e4807ad8a02d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:30:16.702575+00	\N	\N
db7f8899-c4b5-434e-a849-d8aef5763bfb	fc6ea8ce-3aa2-471c-a638-5492f831e7e6	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:31:49.906628+00	\N	\N
234a4cfe-0ef2-4b17-9200-4f957d0aa7cc	a04ba723-d012-4795-bfef-5f0930da384f	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:31:55.72384+00	\N	\N
72e1fe33-d07b-4606-b169-a1042bbc58b0	054c4d9c-89b0-4367-b349-34d4ef4858f6	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:33:35.251356+00	sale	16f1737d-9897-4dd7-aaa2-d65036946600
5d62017a-5fe9-42cd-8e84-86f000feb948	11ed1686-50e2-4b62-83ea-3f9ec7be1324	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:33:35.251356+00	sale	16f1737d-9897-4dd7-aaa2-d65036946600
7b2b32a6-6acb-4d49-a7db-26d0b57a3007	56f9f2bb-b171-40e9-86bb-28eab2504980	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:33:35.251356+00	sale	16f1737d-9897-4dd7-aaa2-d65036946600
67fb3813-7de5-4c62-ab9e-efc16daba2ad	a04ba723-d012-4795-bfef-5f0930da384f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	90.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:33:35.251356+00	sale	16f1737d-9897-4dd7-aaa2-d65036946600
1626b705-a276-4d8b-ae50-ef1bb95b78b4	ef8c2ba6-2961-4dc4-91a5-e4807ad8a02d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	250.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:33:35.251356+00	sale	16f1737d-9897-4dd7-aaa2-d65036946600
0c0a2cb1-1c1e-41d5-8da8-44af2461a66e	fc6ea8ce-3aa2-471c-a638-5492f831e7e6	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	600.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:33:35.251356+00	sale	16f1737d-9897-4dd7-aaa2-d65036946600
36a47942-ce35-4467-b553-63af3d5b8406	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2100.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:34:33.752097+00	sale	86f93f21-f27a-4b22-bfde-54d5ef19089e
16207826-8020-4bb9-af5e-b461f5696266	3cb56b14-6ea0-493f-a7dc-681134db5917	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	100.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 19:36:58.633409+00	\N	\N
5e22061f-d0e7-4b9f-bc2a-0490b35678ba	78a50f8f-fe15-49d2-96c9-8603051aa1b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 20:31:30.584563+00	\N	\N
300d1621-2eb3-48ae-b7ab-6839396296cc	78a50f8f-fe15-49d2-96c9-8603051aa1b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 20:32:05.47657+00	sale	58dad026-29bf-4006-97c9-b63649a2000d
4b568969-349b-406b-ab76-9d36111afb3a	2e0d25da-8464-473c-a2ee-bf11cf9578e3	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:37:55.761716+00	\N	\N
67d90c0a-3fca-4690-9496-e0b9335d0886	e7134cfd-69b2-4a0a-aa3f-880b396de336	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:38:12.871205+00	\N	\N
b576f62f-9b88-47eb-a246-119375de0c52	f81a2a25-a580-4add-a240-60e90d13b4c6	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:39:14.122654+00	\N	\N
5815ea8e-c46f-4ac6-a47e-502c7160bf18	357bbcd8-aad8-4310-a076-15742083bef3	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:40:05.337162+00	\N	\N
0c8867bc-4097-40f8-ae2e-271a7f0d1be3	2f1b2410-06a9-4a81-a2f2-00b1116960e5	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:40:11.343622+00	\N	\N
58243a31-59cb-4163-9de1-d39d9b7ba39e	2ba0d702-dc5a-4cd2-a52b-4a90f0cec736	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	6.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:41:17.40478+00	\N	\N
5f26981e-f14f-4057-b7be-ed65b83871df	a3a57d93-f8d3-4684-b12d-fba192bed3e5	f00a0950-fc40-4801-ab3e-f158fdd9e091	purchase	1.000	3400.00	\N	Purchase receipt	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:46:06.964973+00	purchase	e3d1bef2-4d58-4c92-be2f-e2c74e6da94d
329a78c3-78d3-47f8-8ab0-8dc7092f1a45	7b44581c-5033-4181-b336-4e2b20d9636f	f00a0950-fc40-4801-ab3e-f158fdd9e091	purchase	1.000	10500.00	\N	Purchase receipt	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:46:06.964973+00	purchase	e3d1bef2-4d58-4c92-be2f-e2c74e6da94d
89a411c6-7b0a-4756-a942-5b178dd75977	2ba0d702-dc5a-4cd2-a52b-4a90f0cec736	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:51:13.729458+00	sale	3944e543-a181-43e9-b349-52f2cd909e31
d8732713-9080-4f31-84d0-ac3636e2887b	2e0d25da-8464-473c-a2ee-bf11cf9578e3	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:51:13.729458+00	sale	3944e543-a181-43e9-b349-52f2cd909e31
bde4b5a3-2ba4-468d-943e-fd231b556d45	2f1b2410-06a9-4a81-a2f2-00b1116960e5	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	40.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:51:13.729458+00	sale	3944e543-a181-43e9-b349-52f2cd909e31
d57a6e62-cf31-44e9-a34c-dc16d244fd75	357bbcd8-aad8-4310-a076-15742083bef3	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	2.000	1450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:51:13.729458+00	sale	3944e543-a181-43e9-b349-52f2cd909e31
5379591a-df08-4978-a887-1b7749bc7f2a	3cb56b14-6ea0-493f-a7dc-681134db5917	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	20.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:51:13.729458+00	sale	3944e543-a181-43e9-b349-52f2cd909e31
969f69b9-17fc-4ab8-8f60-fd9e6e51a7e2	7b44581c-5033-4181-b336-4e2b20d9636f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	10500.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:51:13.729458+00	sale	3944e543-a181-43e9-b349-52f2cd909e31
1e6b743d-1b56-4614-9fc0-bd07cc6a66da	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2100.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:51:13.729458+00	sale	3944e543-a181-43e9-b349-52f2cd909e31
9a1fbcf1-b5ec-4840-9d32-355268df5fa8	e7134cfd-69b2-4a0a-aa3f-880b396de336	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	7800.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:51:13.729458+00	sale	3944e543-a181-43e9-b349-52f2cd909e31
58444f3e-6543-4518-86da-8783fd6234fb	f81a2a25-a580-4add-a240-60e90d13b4c6	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:51:13.729458+00	sale	3944e543-a181-43e9-b349-52f2cd909e31
8416b4a5-6933-43b7-bddf-f05cdb4b7cac	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	return_in	1.000	2200.00	\N	Sales return	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-20 23:54:39.505396+00	sales_return	afbcc33c-cc59-4bad-9aae-2d48d8325273
b4e7b3d4-eafe-439e-a988-c312c84d7bf3	e0fb09fc-c273-4d58-9423-87d353d807d1	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	16.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:04:34.981644+00	\N	\N
05cb526e-8705-4fad-b0de-c685ed540372	e0fb09fc-c273-4d58-9423-87d353d807d1	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	2.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:05:11.785194+00	sale	83007bfb-ab57-474f-abcc-2d7a9e6127a1
8e0f993c-fd7f-4b7c-817b-4c7ab6c33ea5	80e5f29e-e3ec-4293-bd3c-3a335ab2477d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	14.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:06:51.75948+00	\N	\N
0e403cd5-3193-40f1-867e-ba3ebda8be10	80e5f29e-e3ec-4293-bd3c-3a335ab2477d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	700.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:10:54.669446+00	sale	3e4c3f63-1044-4314-8d0d-c68ed208d698
d70b26a7-34bd-4674-8657-0276520c71c0	e0fb09fc-c273-4d58-9423-87d353d807d1	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	2.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:10:54.669446+00	sale	3e4c3f63-1044-4314-8d0d-c68ed208d698
0dab5134-d978-42c6-86f2-b2e31fccec79	4edd2a9a-bb4f-421a-a024-08b9ac789032	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:41:59.950641+00	\N	\N
a3b060ba-154f-4f29-96ad-36da9a5e5aaa	4edd2a9a-bb4f-421a-a024-08b9ac789032	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:43:07.255057+00	sale	9a2793db-9c35-49ac-b135-cf96c85f7362
8ad0e543-fe59-49a2-9033-8b7ba61ad3d3	b031b84c-6601-4c0f-8097-1baef1482013	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	15.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:57:51.973149+00	\N	\N
a9871986-a5d7-4788-a0dd-4cb88c5d8dc6	726f273b-fdf2-467d-abf3-8f71d714933b	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:58:08.926382+00	\N	\N
a537a89e-45d9-44e5-887a-cbd26c3f4147	1a1f5209-6c9b-447e-a3f6-79262f62be61	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:58:30.056189+00	\N	\N
b26d33a6-1c02-403e-8372-cb6befcd7c6c	aaa13363-f4a7-4e83-a5d1-673b670324d7	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:59:16.773938+00	\N	\N
dd000f79-6292-4423-acde-31c63fc3f7df	935c8c9b-bd0c-4a18-9cc4-605c4892bebd	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:59:22.272679+00	\N	\N
67ca2cf3-4a35-48d6-b699-eaf82fdfe33b	f1c8f589-b86a-41b6-be13-023b0748c644	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 00:59:25.920523+00	\N	\N
018f298c-8d1e-46a0-9412-cf4dd41b5cfd	1a1f5209-6c9b-447e-a3f6-79262f62be61	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	4900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 01:02:23.42689+00	sale	fd925239-b9a9-49a3-a794-9970ca9036a7
f0cc4bf1-07a7-47f7-a505-179037bfb95f	726f273b-fdf2-467d-abf3-8f71d714933b	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	3400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 01:02:23.42689+00	sale	fd925239-b9a9-49a3-a794-9970ca9036a7
f766827a-5f8c-4631-9e95-3cfa3f3a4fb0	935c8c9b-bd0c-4a18-9cc4-605c4892bebd	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	290.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 01:02:23.42689+00	sale	fd925239-b9a9-49a3-a794-9970ca9036a7
9ba8745a-c126-437c-8dd7-92261278401f	aaa13363-f4a7-4e83-a5d1-673b670324d7	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	190.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 01:02:23.42689+00	sale	fd925239-b9a9-49a3-a794-9970ca9036a7
e5b54e33-8d18-43fd-ad66-3bfc3fd0da74	b031b84c-6601-4c0f-8097-1baef1482013	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 01:02:23.42689+00	sale	fd925239-b9a9-49a3-a794-9970ca9036a7
1ddcde12-a827-4782-9d05-a9f8ff68edf8	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2100.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 01:02:23.42689+00	sale	fd925239-b9a9-49a3-a794-9970ca9036a7
8459a617-66bf-4aa8-8a30-746fc33983e1	f1c8f589-b86a-41b6-be13-023b0748c644	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	290.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 01:02:23.42689+00	sale	fd925239-b9a9-49a3-a794-9970ca9036a7
25c121db-6dd5-4f40-b964-1817d3037d82	232bb42d-f0e8-4580-bd69-5c55cf44c1f6	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:34:02.818267+00	\N	\N
d236afa6-f74e-47b8-b75b-b94a75bc27dc	52847e9c-7117-4b4b-ad10-7a71989405f7	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	11.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:34:57.031061+00	\N	\N
e4d37c07-e11f-4f51-8a57-c468997bbb0a	699467ab-d1a2-47ee-a323-3acd358bf9ec	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:38:26.450999+00	\N	\N
6b5dbff4-e5b0-4dbb-8fe6-d60cf8bbf77a	9a33c016-39c3-459b-abb4-86e89ca804b8	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:39:07.209429+00	\N	\N
03e4403f-405d-4142-aca9-94ce989757fb	726f273b-fdf2-467d-abf3-8f71d714933b	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:41:21.528671+00	\N	\N
b23b7d50-3ce0-405a-90b0-246c467e4ced	949a701a-6a24-48ba-9ddf-36df779c9807	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:41:36.2531+00	\N	\N
dcc98ba1-0022-43e6-b2a6-fa8cb4f0fb6d	8ae27e8e-5127-4a8f-81ed-ce641f393c66	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:51:15.421801+00	\N	\N
dc5c1085-af0b-4a75-b547-3474f14cc96a	159cef6c-5783-4450-b9f4-536b15395656	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:51:25.822186+00	\N	\N
4654970d-8316-48c4-b763-c23b1312a99f	5c4d5b48-b23e-41c2-b354-68e508d70a88	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	7.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:51:44.244732+00	\N	\N
8d5bbe08-3cef-4faa-ba16-82c8db35b3b9	5c4d5b48-b23e-41c2-b354-68e508d70a88	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:52:01.140461+00	\N	\N
d5fc2a91-5485-4033-b49b-d848ea19f967	fc0a6282-8c97-4083-b088-498ba5e51ac7	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:52:22.440526+00	\N	\N
d91750ee-69bb-4b8e-a860-41ca77b89c74	b81fec7b-f1ff-4bb0-8f82-6b0c9b3a0023	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:52:44.387152+00	\N	\N
83764218-c012-4fd1-8ed9-5b3b056e25df	341d5503-de65-4b36-96d6-7e18b0d72e20	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	30.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:56:00.3243+00	\N	\N
76528abf-c5ee-4255-b4d1-55a4892e4a4a	23215db4-e4a9-4299-a378-735c0e080acd	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 12:59:57.318746+00	\N	\N
7f2a1bc0-478b-4945-8efc-11da4595a4c5	1ff6cb61-a52e-4a5e-b41a-ea2fa0c56f96	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 13:00:09.377311+00	\N	\N
416fe21c-60d2-48a0-8ced-9e8148269c65	1a1f5209-6c9b-447e-a3f6-79262f62be61	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	7.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 13:02:28.858296+00	\N	\N
14ceb065-94ee-4534-bc5c-882b890fbf48	b2511f74-ecc2-484a-9c1e-a955efce05b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 13:06:47.309238+00	\N	\N
087f0a75-6a48-420d-8ddf-f710a4eed4c7	c5c49f7a-da74-4de1-b31e-f065f37f7890	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 13:13:33.11892+00	\N	\N
a277fbfd-f715-4d3c-b146-16ceeaa3e080	b04b7f08-0b64-4552-821b-c3001daa6153	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:15:51.033045+00	\N	\N
cb225eb9-80b2-4671-b1ff-5bae7b05aaf0	a7887b2b-34d2-45cb-9552-4938b2a803e5	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2300.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:16:50.416594+00	sale	97b0c3d9-5abb-4887-96de-723d651c0436
043eb03b-e354-40de-bd62-2110c24ae652	b04b7f08-0b64-4552-821b-c3001daa6153	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	2.000	220.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:16:50.416594+00	sale	97b0c3d9-5abb-4887-96de-723d651c0436
31a2fca5-5105-42f6-9af6-ecba769ee78c	e20967e2-77a4-4bc5-9bb5-b45b65858df4	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	90.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:16:50.416594+00	sale	97b0c3d9-5abb-4887-96de-723d651c0436
99064bf7-c7dc-4d32-a923-a2fb2e8579f9	f59d9d20-1a3a-4486-b831-29b46ab327a4	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:24:28.434601+00	\N	\N
70e98baa-dd12-4050-b392-92069ed64f5c	f59d9d20-1a3a-4486-b831-29b46ab327a4	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:24:36.525397+00	\N	\N
46a0f607-2ae8-43b4-a97a-bd41860ac054	f59d9d20-1a3a-4486-b831-29b46ab327a4	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:26:15.55552+00	sale	6450f56e-fed2-4574-9099-912d55b30f02
9a801758-a84e-496e-86c5-dd760dbadca1	a7887b2b-34d2-45cb-9552-4938b2a803e5	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2300.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:27:58.390452+00	sale	6aa9a0dd-0a22-468f-b711-980ad6c85d26
63ba17fd-942b-4160-9839-ba70e2c37237	1308cb1e-cc8c-4a85-ab6a-92ccf53883a3	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:45:43.260565+00	\N	\N
efb1bbd3-fae0-4679-b8ed-b0731e27043f	1308cb1e-cc8c-4a85-ab6a-92ccf53883a3	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	90.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 14:49:25.837455+00	sale	119f43b8-2150-4449-b525-b25e126e8519
60da02dd-00ff-4161-8444-bc3d1ee46203	fe6f7096-f14d-450d-a17f-5fdcc77b27e4	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	-6.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 17:39:43.776598+00	\N	\N
2ce4e297-059b-4b7f-bf8d-175a8b1ab643	1120add1-20c6-4ae5-a729-5c716708488f	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	6.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 17:42:32.755426+00	\N	\N
022693a2-0169-4f87-a787-a19522baa3fb	661bdc39-9def-4ddd-96af-0d6d91d8af0e	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	40.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 17:50:40.843751+00	\N	\N
890c735c-f2a7-4b52-8371-85edd76c5068	1ca11cda-7ca7-46b4-9c9d-85bcb6bbfb58	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	9.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:04:00.145923+00	\N	\N
7d4bc20c-169c-4c8d-bce3-7a9f52bf9bd4	fb1df70f-6f73-40fe-89fa-bea2be5c2d87	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	22.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:04:42.934192+00	\N	\N
d6d7c131-b50b-4896-a3d3-5d77c56403b2	39b92f0d-f8c4-418c-a0ec-325a23be3970	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:06:29.19905+00	\N	\N
d55678f8-9e70-4b1f-b158-898c3f614653	1992e98c-4fbf-4210-82ad-91c8ca96a679	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	10.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:07:17.343613+00	\N	\N
fa2f30cf-3f90-4fd9-926e-1bf9a0ed47ff	1308cb1e-cc8c-4a85-ab6a-92ccf53883a3	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:08:39.645575+00	\N	\N
5aa255ed-eded-4b51-a78d-88ada1ebad14	5738a4b5-aa2e-4325-b60b-d6d980dbc1fc	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:12:30.10103+00	\N	\N
b6a234d3-ad4f-451d-a9ac-61fc420b1ede	95be6ea9-d2a1-4dbc-bd6d-a9bac27ca332	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:12:41.473829+00	\N	\N
ffb18ebf-05db-483a-9d62-6d791760462e	1120add1-20c6-4ae5-a729-5c716708488f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	6400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:15:50.836514+00	sale	148695ef-ff2b-49fc-848e-542cf947a9cc
f11853c7-7032-49e7-855b-b98f3aef8673	1308cb1e-cc8c-4a85-ab6a-92ccf53883a3	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	90.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:15:50.836514+00	sale	148695ef-ff2b-49fc-848e-542cf947a9cc
e6da28f9-2ebb-49e5-a9ea-b6e8672eaeca	1992e98c-4fbf-4210-82ad-91c8ca96a679	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	2.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:15:50.836514+00	sale	148695ef-ff2b-49fc-848e-542cf947a9cc
374cb754-86ee-4f8b-a8ea-5d0bf1a3a701	1ca11cda-7ca7-46b4-9c9d-85bcb6bbfb58	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:15:50.836514+00	sale	148695ef-ff2b-49fc-848e-542cf947a9cc
ba56beb4-ef15-4c18-bd56-95d97e724249	39b92f0d-f8c4-418c-a0ec-325a23be3970	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	90.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:15:50.836514+00	sale	148695ef-ff2b-49fc-848e-542cf947a9cc
d68813ed-47bc-4df8-8428-2875654a53c3	5738a4b5-aa2e-4325-b60b-d6d980dbc1fc	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1200.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:15:50.836514+00	sale	148695ef-ff2b-49fc-848e-542cf947a9cc
4ecd6b99-25d2-4146-9d03-8abb6a929c47	6b97b2f4-dac6-4e92-bd5a-a01ea8b73b13	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:18:43.75489+00	\N	\N
1ef37346-8ca3-4ec4-bd91-e678f49f9cb5	ccc3e220-3d0f-4d3a-b4fa-7ed0fc4acbfc	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:22:03.694144+00	\N	\N
1d8bc8a5-0288-4e9a-b5bc-f75e5326feab	42f9e0c1-bf46-45a8-be43-d71e4204fc97	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:26:12.878213+00	\N	\N
63ed8e13-728c-41c9-ab8e-384307dda988	7928527c-6a32-4920-860f-e573a3dc5f18	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:27:41.527569+00	\N	\N
710db388-b784-4bdf-acd8-e027f9c8e22e	e86a0a0b-aae9-40e3-bf87-d93526424c0d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	20.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:31:59.753684+00	\N	\N
4f88cc3b-6e6a-4d9e-8cd8-2020e5140e27	2dce84a6-e616-4e17-916c-7cff9d3b2790	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	14.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:32:09.889526+00	\N	\N
fcaae563-f826-431f-9060-e9834d342d83	964387a5-0a14-450d-bcbf-a251477f441d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:32:29.289328+00	\N	\N
f17013e2-f34b-42ea-81f4-7b7970f9fbcd	b0ad0530-d55d-477e-bd58-6d54b6e70039	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:33:48.961788+00	\N	\N
3484376b-fcf1-4914-b214-d81159e3fa74	0189bc7e-b550-4348-867a-1ef3076e4d88	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:46:50.984704+00	\N	\N
d8ff3d5a-ff26-499c-8cef-4cf5ba746e0d	c34f9e18-82d3-4199-a39a-44c6c104d997	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	9.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:47:09.642124+00	\N	\N
7e7e4fa6-8190-4a05-a320-39ddfb80002b	c806810f-3e1e-457d-9185-4ce688e8c24c	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	6.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:47:15.260452+00	\N	\N
1f8c52b1-6fa1-48c0-8db4-b476dc21aa43	126163e3-d64d-4473-bea2-2e8e8aec129a	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	19.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 19:53:15.701677+00	\N	\N
e18fa09a-5da3-475e-9212-956beaffcc15	afe826ee-744f-49d8-ab42-1e8ad34dda26	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	21.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 20:03:40.015363+00	\N	\N
7c9e0736-fc8a-47b8-8e51-d4a7f3e8d91e	661bdc39-9def-4ddd-96af-0d6d91d8af0e	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	4.000	90.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:15:50.836514+00	sale	148695ef-ff2b-49fc-848e-542cf947a9cc
20d58b8a-19a8-44f6-82d5-1ab370bdf691	95be6ea9-d2a1-4dbc-bd6d-a9bac27ca332	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1200.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:15:50.836514+00	sale	148695ef-ff2b-49fc-848e-542cf947a9cc
f14df451-43d1-411a-909a-2151f8516f86	28e27bd6-fa77-4fa4-b03e-e76abed1e884	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	7.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:17:32.465595+00	\N	\N
1b1c0454-b671-4e0f-b0f9-8cb71db4d239	28e27bd6-fa77-4fa4-b03e-e76abed1e884	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:19:50.649521+00	sale	ccc02089-567e-4d2f-ab10-332437446517
4f3ea85e-d41b-4566-acc6-93f8a30706c8	fb1df70f-6f73-40fe-89fa-bea2be5c2d87	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:19:50.649521+00	sale	ccc02089-567e-4d2f-ab10-332437446517
212bf522-3835-40fe-ad66-362e20e7ffc3	3ffdfd69-4efd-43cb-9a13-ed72990890b2	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:20:09.442716+00	\N	\N
173b3dac-b2b3-4b22-9156-3315572acae7	3ffdfd69-4efd-43cb-9a13-ed72990890b2	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	270.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:20:48.734009+00	sale	7af64206-af9b-485f-a3e6-97a877675f24
ddbac6e9-9bf6-40bd-bd0f-0fa3da68c773	88b84530-e118-48a2-b54b-c60684c7b68d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:24:32.127794+00	\N	\N
fa0810a6-9d21-4794-b7d4-ea7b08abbb1c	88b84530-e118-48a2-b54b-c60684c7b68d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:24:43.957763+00	sale	50d9f6fa-dbc2-47a4-b478-4a56d6f12218
80493c8d-5ac3-4225-8c08-6f0d2f833891	80e5f29e-e3ec-4293-bd3c-3a335ab2477d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	700.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 18:29:04.416622+00	sale	a2def70e-e60f-47e0-b452-e2d91e282bac
7783e603-33db-43c3-bca1-b6b18b476356	4333bfd6-0bd3-44cb-8eca-01c380e70a09	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 19:59:02.926592+00	\N	\N
8bfd2176-75ab-4904-bfe1-d1d27df34c42	8bc6d325-eead-424a-8e56-117a0adc2427	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:01:43.63409+00	\N	\N
6f515b72-a4d5-449a-b6ac-60c30739aec4	69adae6f-2b51-43ec-9329-ce2f65660eaf	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:04:11.277881+00	\N	\N
6a02e432-7450-4e3e-9e53-549f50cccfb4	17cb9df6-89f3-47f5-a2f6-c105aa579aae	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:05:34.623192+00	\N	\N
fda05acb-8aaa-4c38-8152-20c03a5b8bb4	e4cef90c-932f-4d2e-823c-5321dadcdbd5	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:06:22.50032+00	\N	\N
861a7d76-222e-4099-a6b5-87fbd97e495c	5879e2ce-ab29-4fe2-bac1-e2d4d887f845	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:09:22.066402+00	\N	\N
f88f2d71-23f7-4809-bddd-cfbb3dd68fe3	cc92d23e-c4c1-4e76-8c4c-419501d4dc11	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	6.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:13:57.23135+00	\N	\N
27a51605-fea7-4309-87b7-b21be75bb1d4	8d82cbd4-6995-46f4-9591-7968c4a572d4	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	6.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:16:54.283475+00	\N	\N
875b516c-9073-435d-822f-b73d3360267c	950566db-7963-4bf2-a6b3-dd646cbe711a	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	35.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:22:06.947879+00	\N	\N
3383e44a-ff87-4f06-a729-bf5d06e8979a	2dc1b790-5ffc-4d20-9372-3bdbf3d7b663	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	46.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:25:09.882935+00	\N	\N
0b4e40f1-806e-4821-9738-8728628a9854	c91854e6-9439-406a-8012-8cad4f8282d8	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:28:10.151258+00	\N	\N
165f637a-a616-4b18-a3ef-d969bcb8f59c	47a0c003-5d56-4e9a-a09b-e9fba536d726	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	7.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:29:51.213064+00	\N	\N
1b11c0fe-696c-49f5-bd38-57bec57fd486	8e1d8b38-b87b-4950-bba2-be1e4c8ad70e	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	17.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:35:00.888325+00	\N	\N
d2964eee-2217-45a8-83b3-e759dd693fe4	d34e2069-15cb-473d-a93f-60e931b4c622	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:42:40.872721+00	\N	\N
e1c40f9c-ec04-4bc8-b307-cdcf2fb58564	2f57de48-5426-4618-9b0a-a87fb9b00b0d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	15.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:46:31.247708+00	\N	\N
218a4965-b5ba-41dd-8c06-f8e1bc529b6b	b57ba094-928d-4eca-97fa-b3863ab7ba8e	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	17.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:46:55.822915+00	\N	\N
ec80627a-7b94-4887-8af5-aef2805b7654	8f42e5fd-7676-4f6b-bbf3-346fbf6b25fa	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 20:55:14.792186+00	\N	\N
06bc38b5-2ba5-47a2-9aa9-a8836fab261f	e20967e2-77a4-4bc5-9bb5-b45b65858df4	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	90.00	\N	POS sale	ef8142de-d644-4bd6-aa37-5613b041e0ad	2026-09-21 21:09:09.726049+00	sale	0fba8446-b96b-44a9-9b73-a038e24d47cc
8ebd9845-beeb-43f3-a569-74c2cd114733	126163e3-d64d-4473-bea2-2e8e8aec129a	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 23:00:17.790966+00	\N	\N
736bac6d-ac9c-487f-a43e-50318aaf5dee	8f38bd22-1abf-4689-b78b-13ba2703b0ad	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 23:00:42.868208+00	\N	\N
c7389ea2-d2cb-4d43-95da-fcff81c122ec	126163e3-d64d-4473-bea2-2e8e8aec129a	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	650.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 23:02:30.506344+00	sale	d5777c1d-cac0-451d-923e-111f0224e3a1
5be7866a-98c4-4253-bf87-4ef7bd32e8a8	8f38bd22-1abf-4689-b78b-13ba2703b0ad	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	3900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 23:02:30.506344+00	sale	d5777c1d-cac0-451d-923e-111f0224e3a1
6459a6c0-0b57-47a5-93a4-1062deffcf90	08392996-e913-4f1f-9518-ba1a17b274af	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 23:05:59.257441+00	\N	\N
0f98243f-d133-4577-84cc-29d15a82ade7	126163e3-d64d-4473-bea2-2e8e8aec129a	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 23:06:34.917665+00	\N	\N
6b9a3609-bfc5-4b11-a918-2f4718f464f6	08392996-e913-4f1f-9518-ba1a17b274af	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 23:07:15.48219+00	sale	949ccda8-4a68-4d24-bd0e-77d6c8e88ab0
dc34bdc8-aa54-457d-a897-72fc101fd167	126163e3-d64d-4473-bea2-2e8e8aec129a	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	650.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-21 23:07:15.48219+00	sale	949ccda8-4a68-4d24-bd0e-77d6c8e88ab0
a62e44da-e1c2-478b-b41c-18bef528efe0	c83448c4-85bb-4d60-bd71-ba86fe643d10	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 11:08:09.045395+00	\N	\N
dc574d5f-972b-46c1-860f-12f9e0f37a32	c83448c4-85bb-4d60-bd71-ba86fe643d10	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	180.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 11:08:43.096348+00	sale	c763f24a-fdb5-440a-9297-a76ec90f52dd
73093bfb-04ef-4250-b2c1-c645e9c6a113	3cb56b14-6ea0-493f-a7dc-681134db5917	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	40.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 12:30:30.890358+00	sale	9daa8e11-32b0-4931-991a-ed9ab7b40f13
3191ac2b-9cb7-41ff-a888-e4f56abc9031	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2100.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 13:21:02.798311+00	sale	5bcfb8a0-057d-491b-9028-6c5155bed1fb
66a54f66-0cbb-4580-a33d-45dbc6123ffa	ead6e7a8-0fde-4717-bd4b-65fa0f59a35c	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 13:31:19.688779+00	\N	\N
3316a1a0-d5c4-4a41-ba67-cbc4959cec1d	ead6e7a8-0fde-4717-bd4b-65fa0f59a35c	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1100.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 13:31:38.268963+00	sale	84977fd4-01f7-42d8-964b-7f555f2fc53a
d2e29aea-b618-4b32-b395-885fe3e7ef6b	2d23f736-104e-46fe-ba9c-bddbb8e5793f	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 14:42:52.705516+00	\N	\N
1f9d4524-e8ee-4dd7-bc96-c77f89fb221e	050d2592-c49a-47fc-a43f-810632c9dac9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	6.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 16:09:00.610156+00	\N	\N
c9c511dd-2aa3-48eb-8a26-75da8afeb468	a067aa3b-ed5c-421f-ad43-992b8daf5af2	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	17.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 16:40:25.759482+00	\N	\N
20929aae-fffa-450d-95cf-eb4a68af9dad	a067aa3b-ed5c-421f-ad43-992b8daf5af2	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	350.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 16:52:26.464804+00	sale	651c336c-a3a7-4701-b66c-497a12f68a19
3c0af4d7-70bf-4a48-a54f-842f2241ca73	050d2592-c49a-47fc-a43f-810632c9dac9	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1200.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 17:23:50.16267+00	sale	f7135022-c484-4a9f-83c3-6a4012598d7b
c3c1e948-05cb-4a48-96d2-5eb301b29f74	fb1df70f-6f73-40fe-89fa-bea2be5c2d87	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 17:23:50.16267+00	sale	f7135022-c484-4a9f-83c3-6a4012598d7b
f895b4b1-3061-473d-b916-e808f2855cfe	c156a116-eef2-4a47-94dc-00b514f7b9a2	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	9.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:16:31.158203+00	\N	\N
3802594b-74f0-426e-aedf-6dd7b9fac64a	68530644-1472-4fa9-84c0-e82aa848ff0c	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	17.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:20:10.792281+00	\N	\N
38fc30cf-c10e-4ba2-919b-7d7f80e1cf2c	b1e6e367-f6c6-4bb4-af2f-f7a71245c5a9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:21:56.612799+00	\N	\N
223cd092-0017-4ce0-b00f-d7df4279bb19	4be22fbe-0616-45ff-8dae-103a8d7613e8	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:25:36.167942+00	\N	\N
5a97c382-9194-4663-9015-6e8a205f3510	7a7f8655-57b8-48c1-98aa-04830d324e0b	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:27:08.132152+00	\N	\N
d00ae892-8074-4223-bef7-e54ad919181a	7e0efeb0-8264-4598-9ff4-644124b6b55a	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	23.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:29:35.428444+00	\N	\N
5758d33e-d207-458e-905d-eb61b1bf73fb	6b9db4f0-57cf-4502-a410-8461c9aed3f5	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	7.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:31:24.360925+00	\N	\N
f0fc9a35-9a30-4083-8cf7-340e69cad540	58f54eda-098e-4e7d-a867-7d8a425b18dd	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:35:58.312079+00	\N	\N
92f9ac9a-da64-48a7-86d8-698893883d90	159eb1bb-920d-4fac-9751-6c15800a187b	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:36:17.426446+00	\N	\N
647ec882-1bfb-433f-ae7f-156fcb19e398	9e60ec82-1c0b-4838-809c-177e75e48dee	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:52:16.079517+00	\N	\N
e911d80b-0231-4fb4-835d-7c0a310dd618	61f0cab6-4cf4-4276-a31b-ff5ec62a7420	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:56:00.929065+00	\N	\N
c4d1e00f-a139-424d-b57f-b6b279ec3187	e0f400b1-a39e-40cf-a404-72e31c439db9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	40.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 18:56:14.598809+00	\N	\N
61d55f30-b015-4498-95e4-011ad976177b	afe826ee-744f-49d8-ab42-1e8ad34dda26	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 20:03:49.789912+00	\N	\N
0ce47d4c-9a03-41f9-b231-b8486ca2ad5c	02ec7152-406f-4ff1-bbfc-24db0fc1cd3c	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 20:48:49.288349+00	\N	\N
58c54496-7a33-4880-866f-1e92e6577d08	02ec7152-406f-4ff1-bbfc-24db0fc1cd3c	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	500.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 20:49:02.506731+00	sale	9f20be45-8c79-42e6-9b35-46168a4711c8
ab35d789-40b4-4a74-8df0-86e642a12d98	5073322c-80d1-4ddd-8f49-af66a9d03e80	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:15:48.411746+00	\N	\N
c560b900-9867-45d5-98f8-316a51c5a097	0194a362-4c41-4ab4-90a0-1b863931747e	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	10.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:20:59.978892+00	\N	\N
9ba8c823-d62a-4834-bd23-35ed4c330b35	0194a362-4c41-4ab4-90a0-1b863931747e	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	2.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:23:58.659196+00	sale	4d947441-fbce-42f3-9b3c-c58b7a9fc0f9
0ea97993-4e26-4f9f-88f3-cbe2c94d0478	4be22fbe-0616-45ff-8dae-103a8d7613e8	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:23:58.659196+00	sale	4d947441-fbce-42f3-9b3c-c58b7a9fc0f9
f169330e-7643-461d-84fb-a98a732d553c	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:23:58.659196+00	sale	4d947441-fbce-42f3-9b3c-c58b7a9fc0f9
9b6303fa-1aaa-4d3b-9f68-fd5ecb426711	09d0d848-423d-426a-98a7-2c95e4738540	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	33.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:29:46.198483+00	\N	\N
6b4a55f4-1b84-4cb1-9492-285658c17f83	df1b6c5e-f8e7-4994-8860-d8cc66b6a761	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	20.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:30:07.967637+00	\N	\N
30a523b1-8885-4da4-864e-2cdb554ca7ae	97fe00b9-956c-42c0-b0c8-b04481cb9665	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	16.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:30:26.808466+00	\N	\N
5d5a6065-c8df-434e-8c36-e880a0d8f3f4	4af0ad25-987f-4628-ac91-13467f10238c	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	14.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:30:43.975159+00	\N	\N
7cbd2f22-e3d6-41c2-8b27-7279b60ae3de	4af0ad25-987f-4628-ac91-13467f10238c	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:31:48.238509+00	sale	82208862-b457-4b98-ba00-d1c0957026c0
4b290ca8-c62f-49ff-9712-eadb2d30c726	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 22:31:48.238509+00	sale	82208862-b457-4b98-ba00-d1c0957026c0
7dd4f3eb-97d4-4a71-b4c0-2453ac6dad22	1e709de5-eaa9-4218-b382-55fd7beb11b0	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 14:54:08.193436+00	\N	\N
151c5fc9-d700-43fa-a1fc-6e7888461fcb	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2100.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 15:22:29.761912+00	sale	a9c8fdbe-6f36-4e1e-86e3-d5451c2040e7
76550255-163d-48a1-a4df-dfc0ee9b05ed	1a1f5209-6c9b-447e-a3f6-79262f62be61	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	4900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 15:30:36.703641+00	sale	c03e0411-99c6-42ac-a461-93c77aae785f
0c511d61-c0c5-4ffc-b1b0-2a25fba921b5	6b97b2f4-dac6-4e92-bd5a-a01ea8b73b13	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	800.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 15:30:36.703641+00	sale	c03e0411-99c6-42ac-a461-93c77aae785f
a5f02eee-5e63-4020-acee-ad8b7363899f	726f273b-fdf2-467d-abf3-8f71d714933b	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	3400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 15:30:36.703641+00	sale	c03e0411-99c6-42ac-a461-93c77aae785f
7af61964-f717-4760-b9fa-8bae31fe67d9	b031b84c-6601-4c0f-8097-1baef1482013	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 15:30:36.703641+00	sale	c03e0411-99c6-42ac-a461-93c77aae785f
2a02f3cb-347a-455b-900a-5e296cb7dd35	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2100.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 15:30:36.703641+00	sale	c03e0411-99c6-42ac-a461-93c77aae785f
dd1d807b-c669-4060-8c81-4fc0d98e97ec	09d0d848-423d-426a-98a7-2c95e4738540	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:00:10.955721+00	sale	ad7f0c70-9483-4c37-b432-3833ae527e71
22b82e61-32eb-4bec-bea4-fb0c91b5feb4	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:00:10.955721+00	sale	ad7f0c70-9483-4c37-b432-3833ae527e71
b2348e90-74f1-42c6-98ab-5ae9c63b0a2e	3425d17f-c9de-42a3-81e7-081005b4bec7	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:13:27.318316+00	\N	\N
24aa0c71-aaf2-40e4-9a8b-65c71c45b1d4	7a4bc7d1-1701-44dd-9297-8e0bbd04c19e	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:14:29.752447+00	\N	\N
0166b27e-8f8b-483a-8561-62e843f64c0a	27388e7b-ef84-410f-befb-6acae107712b	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:14:53.32181+00	\N	\N
2372d9dd-f5fd-444f-9a01-bd56c63068e7	a2f663c6-b362-41e7-ab30-9144d30a33b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	6000.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:15:19.631183+00	\N	\N
40701b80-07b5-4178-9e36-994950830259	a2f663c6-b362-41e7-ab30-9144d30a33b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	-5999.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:16:00.797829+00	\N	\N
1e92600f-639f-41a7-91da-b1eacf7727bd	d27977cd-6e65-4b53-89ab-8b4080cc4738	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:24:04.241507+00	\N	\N
8f477bbf-ebd3-4816-b711-027747c330df	6391a825-1fa2-4d49-8c77-b2110d7358cd	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:24:17.843416+00	\N	\N
feab7e99-408e-4f70-8c20-4fa2157f5009	45f3b222-44eb-46d4-af59-39a758dae237	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:24:59.309335+00	\N	\N
8c680640-1fa8-4fd8-8021-c389130f1b70	6ecccb78-add2-4de3-a137-d6798505ac49	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:25:35.990626+00	\N	\N
ed158c35-f6eb-4e4e-afb7-8cf831b3b254	4207f0a5-a4d4-4989-921b-5a68b445b0d1	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	100.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:36:04.833198+00	\N	\N
ccbb7720-b4db-47f3-afd0-517a8ea25408	bec3baa6-b867-4560-97a8-3c800e2fdf98	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:41:45.682236+00	\N	\N
a57be043-8cfd-4185-b33a-debcfc238a3a	341d5503-de65-4b36-96d6-7e18b0d72e20	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:43:40.448395+00	sale	1561993d-8a53-457c-ac24-818e08715012
474ae994-2242-4eac-82dd-706d24693021	4207f0a5-a4d4-4989-921b-5a68b445b0d1	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	180.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:43:40.448395+00	sale	1561993d-8a53-457c-ac24-818e08715012
e34e265b-1abf-4dad-9b44-272271058220	bec3baa6-b867-4560-97a8-3c800e2fdf98	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:43:40.448395+00	sale	1561993d-8a53-457c-ac24-818e08715012
8d2b73ca-583a-4266-b711-722c06d89e6d	db0d815e-1ca4-42ca-bc0d-8096bb65ec24	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	10.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:44:25.091411+00	\N	\N
6cdc5843-4816-4faf-831c-8af85d2aeadd	79ce9af2-7485-4824-869f-2d318f916878	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	7.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:46:43.791852+00	\N	\N
45738736-54c8-4968-8acf-80ed20770362	a8226c8a-ba78-42fa-8335-fa056cb37be8	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:20:45.7715+00	\N	\N
d9c2fc67-818c-4752-a5aa-531cc94ebb67	17974d65-2b39-4e66-b3e9-54e13ea3f066	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:21:11.790323+00	\N	\N
100ff1fa-7646-472f-ab46-36a865f74b05	3cccd0e8-c588-4633-a6b6-47f080d2b98f	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:22:24.608577+00	\N	\N
1739c6c1-0c19-4c08-a172-906edce840d5	79ce9af2-7485-4824-869f-2d318f916878	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:48:23.000857+00	sale	16c8666f-1286-4e7b-bc0f-314732bdfe8d
51a0e9f0-6545-4d2c-b06c-f8604b1458c5	cecc9d0f-4342-4591-8553-dbaffe71b588	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:49:30.880476+00	\N	\N
d1d3d242-cf57-488c-ba41-7ccc7b18a423	cecc9d0f-4342-4591-8553-dbaffe71b588	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:49:43.259006+00	sale	11956f6d-d1c1-407a-81cd-cb36778b0a43
c0c7049c-8b1d-40bc-aff9-dbf7a32ecb32	db0d815e-1ca4-42ca-bc0d-8096bb65ec24	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 16:50:34.55671+00	sale	5ac65b05-f223-452c-a894-cdb6ae4088b4
cf892a0f-6ce5-457a-81ba-e933194a4c5a	7e0feeb6-93dd-4d00-beb1-0199132416dd	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 11:38:29.295599+00	\N	\N
fbf7eee2-8165-4aa3-8a88-a2b8272313e9	8cb87967-d5be-427d-bc84-ecce76d8b40b	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 11:41:21.702884+00	\N	\N
b4770e16-6edb-4844-8e11-f1641be02b48	7d5eb3e7-707f-4380-84ec-45257dd439fb	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	7.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 12:04:16.162899+00	\N	\N
478d2cf9-c4f3-4c78-9aba-5b7534ebcccf	8ac97183-bd50-4b64-a6dd-8ff577a8042d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 12:04:38.53166+00	\N	\N
cfab86b0-f9d6-4cfe-8f84-2ae90205c839	31b3e4fe-3b75-47a1-9a3c-a7ab4760a7c9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 12:05:01.752782+00	\N	\N
2efb8b6d-5f16-4a3d-9457-795346e7c857	ba77826c-7a1e-457e-b178-0ee046f5eb15	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	24.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 12:13:28.021338+00	\N	\N
07e43380-f71c-4599-af5b-ab24c5224c71	e7f288f4-7e80-4edb-b5c2-a65662a27340	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	6.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 12:13:36.150897+00	\N	\N
7c3a5dcf-24ff-44b5-b954-67447e39120e	a1a3fde4-5ef8-4fe5-8111-9ba9fe82bbf1	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 12:14:30.025755+00	\N	\N
878d3983-599e-4985-be7f-9239595b46fe	af569f77-8680-4d22-a686-93f851b08ee8	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	32.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 12:15:21.242884+00	\N	\N
55d5b25f-4a2d-4351-84df-3b7916749451	0ded29e4-ea57-415c-a933-bf02c6d492a9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	28.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 12:16:09.024589+00	\N	\N
a67522cc-9519-4c37-9b5d-6bdaecf5e8be	dcedf7e6-62a7-47bd-8d16-f6bc909e746a	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 13:01:30.042762+00	\N	\N
0ee78b98-51d5-470d-8d4c-86eaf8cd432c	84841448-1831-4b7b-b014-4ee11c4beb65	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 13:02:01.857425+00	\N	\N
02f2a857-b363-4217-84cf-0d4648f3e0d7	46af6a39-fef3-4fa6-92d6-b7d51ad09bd9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 13:02:44.702354+00	\N	\N
1f77354a-85ab-4afa-be1e-de0b4beb3cc5	4ba7afa5-3784-45b4-8ad3-ef8dae4f085d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	30.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 13:03:16.796255+00	\N	\N
7f0b368a-aef8-4d3d-94f5-6443362b81d9	3b8d031a-0f83-4775-824e-17aa0fa276d0	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	18.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 13:05:34.878076+00	\N	\N
eefed359-e462-473a-95be-b2dbab09a8dc	22c1908e-f7a5-42be-9619-60a2f3f51c57	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	9.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 13:13:06.583608+00	\N	\N
ccc504bf-8a24-4883-9279-306f407a67e4	c7b09c61-befd-452f-a58e-55d336ebffdc	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 13:14:15.366289+00	\N	\N
7f139107-ef4f-47d5-ba35-18aafa405978	9a33c016-39c3-459b-abb4-86e89ca804b8	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1000.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 16:32:38.201787+00	sale	8c604b7b-6e82-47ba-acf5-9a83d23d5048
da46490d-70e1-4cee-ba77-a6767b03f330	0194a362-4c41-4ab4-90a0-1b863931747e	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	2.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 19:10:11.695998+00	sale	0fa302ac-710a-474c-8b0b-32564f1a3e07
23591f75-b400-4baa-84ed-bdfdacfdad59	3b27463d-dcfa-460a-9bef-9415cce5f42a	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	10.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 19:54:32.886418+00	\N	\N
98cb8f27-3d76-426d-9575-17e00fad74ef	3b27463d-dcfa-460a-9bef-9415cce5f42a	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	270.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 19:55:06.509355+00	sale	718c0a4c-b156-42e7-8996-794036b8d95d
75b8242e-b402-42fc-94bd-d6ac29a2c33a	e8c7cd21-01b2-43a8-a710-98dcee444c2c	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-25 18:17:11.924454+00	\N	\N
2b5f8840-4362-474c-97f3-597b803b0da5	357bbcd8-aad8-4310-a076-15742083bef3	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-25 18:17:48.10109+00	\N	\N
83bbff89-c0c4-40c2-bdea-dd851f8b6080	23a108fd-1e68-49cc-9b02-48672022fdf5	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	9.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-25 18:18:07.603743+00	\N	\N
15204998-b641-47b4-9a35-83bd35febb6b	b4937e5f-74dc-497a-ac20-2a6b01faba4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-25 18:18:24.594557+00	\N	\N
510fbed5-e37c-4a37-932e-e7b07aefc539	457a1957-d5bc-4964-b819-f443f79fcbb6	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 11:35:44.277575+00	\N	\N
cffe7a03-2722-4259-99d6-a4b43edea901	c5385f9b-57f1-4f9e-9c58-9458f2f2c541	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 11:36:07.629765+00	\N	\N
24505ace-2157-4f15-9206-1adc97539e62	be2bade7-b8d5-43e3-bf9f-7d469fc94e82	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 11:36:48.195722+00	\N	\N
367b1a42-6ead-448d-8465-0665a206f1e1	26e8d8d0-32ac-4abb-a5be-46766973051a	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	11.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 11:39:29.880016+00	\N	\N
d5a16aba-71f2-4881-bd03-39abd92936ec	c1837e2e-c331-4e19-bbb1-b9f3d504f30c	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	9.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 11:40:32.80615+00	\N	\N
3e01b109-af0d-4496-bf55-aaaf8bdbcfe8	23448fc7-bf39-4773-be4e-55c3da5af0b2	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	7.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 11:40:44.561924+00	\N	\N
3387475c-e3b8-4c71-8515-c98fb97b778e	be2bade7-b8d5-43e3-bf9f-7d469fc94e82	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 11:41:26.534927+00	sale	c97c98c9-578f-4776-96be-4b145c297a33
7dda9133-6fed-491d-a51b-6f7000742785	26e8d8d0-32ac-4abb-a5be-46766973051a	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 11:41:45.887686+00	sale	904a49bb-a1b4-49cb-bf46-d3400cb02529
43c15166-4f96-4f92-971a-5eb5a64df4be	fd10f719-0df5-40dd-8f0a-6a1c8de70a36	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 12:35:13.991469+00	\N	\N
0657d737-20eb-43af-9edc-c28babeae927	13f5284b-62bc-4297-899c-998cdb330c0d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 12:35:21.04453+00	\N	\N
5ad8387b-7c69-4d40-b97b-084faa7e062e	24cedfdd-dd19-4347-9091-1e9495e0a4e9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 12:35:44.781522+00	\N	\N
854fc74b-dbd1-44b9-9a7d-3ff9ddd6975c	341d5503-de65-4b36-96d6-7e18b0d72e20	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 12:36:50.661856+00	sale	cfd69f6c-98c1-4090-95ed-664c0c4fccee
e98c0931-5d5c-48f3-b8cf-6a4459b431ef	09d0d848-423d-426a-98a7-2c95e4738540	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 12:39:09.878951+00	sale	20bab1ce-e0be-4fdd-8601-dd514803b7c3
111b7598-fbe4-47e3-aff5-dac46aa8d1ff	e0fb09fc-c273-4d58-9423-87d353d807d1	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	2.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 12:47:13.017117+00	sale	9067bcb6-8f83-431f-8a3f-60421ef09368
cf6e14f7-f42a-4e5d-bced-db8adc90c2b1	09d0d848-423d-426a-98a7-2c95e4738540	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 13:07:11.820882+00	sale	2cfc3dae-c39e-475a-8309-29cbbc4f4f83
35b19f6d-0dee-4210-8a82-3d7c24058d5c	2f57de48-5426-4618-9b0a-a87fb9b00b0d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	270.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 13:08:59.108622+00	sale	73e18190-dcf3-4cc2-9b83-8f7a8135d44b
b5cef1bf-de09-49be-b23d-3d21f354f7ce	2f57de48-5426-4618-9b0a-a87fb9b00b0d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	270.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 13:09:29.998513+00	sale	fab81270-7b8d-402f-ad27-924693cb832a
70a535be-39e0-410b-9adf-2483635b7faa	09d0d848-423d-426a-98a7-2c95e4738540	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-24 13:18:13.583329+00	sale	801dfada-018f-4be1-9f20-3e9ffa07c1ca
1e9a65ab-b796-4110-a7c4-36d6dc84b504	f59d9d20-1a3a-4486-b831-29b46ab327a4	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 13:26:50.648643+00	sale	af31a2e9-d36c-4730-92c4-67587988ea00
957ee9dd-64d1-460c-ada7-9faaf1193802	58dcb1ba-bd63-441a-a2a4-95ad38d0870e	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	16.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 16:57:40.057469+00	\N	\N
b93cfa0c-cbd5-45af-b31a-693e6c69258b	58dcb1ba-bd63-441a-a2a4-95ad38d0870e	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	2.000	900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 16:58:00.076874+00	sale	191c0e01-612f-4a86-a4f3-0653c833521d
7b4737be-802d-44b1-b83c-98759a70842e	9ed1022c-9015-4165-aace-fbd3a371f5b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:03:28.411425+00	\N	\N
3a4fc175-b51f-4192-bbed-2b761d8e93c0	ec2ae3b7-98b2-4ad8-9b8b-7c6a359144c0	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:04:22.095007+00	\N	\N
89bc8082-3dc4-4212-9963-1987b014e9a7	08bae2b8-58ae-46a3-a30e-aaae2c33c4ab	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	24.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:05:39.368595+00	\N	\N
32d05001-af11-4f6f-97ac-2c1e7832ea6d	d9199798-c0a8-4a31-8f68-d117a3e6ae4f	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2100.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-23 17:06:44.57585+00	sale	e22754e2-3fc4-4c1b-958c-e126b2303ceb
7a4afda2-a518-475a-b96a-eccb3be02b95	f59d9d20-1a3a-4486-b831-29b46ab327a4	f00a0950-fc40-4801-ab3e-f158fdd9e091	return_in	1.000	1000.00	\N	Sales return	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:10:04.332592+00	sales_return	c71ddb5f-c037-4fca-8322-40d51c400a49
94de8296-301b-4999-9dd1-1a29e574494f	9922e1aa-c67f-4007-a093-8528fd89e4f1	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	3.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:15:10.451275+00	\N	\N
85803d48-5368-49cc-b5c5-26546d490b6e	7a1f6013-5e59-4443-9637-32d425ec1d7b	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	5.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:15:34.499542+00	\N	\N
9d4016af-9921-4d15-a84c-61ff44e3fb4a	f3f6271f-50d7-42b2-8a23-5d688fd0042d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:19:35.451017+00	\N	\N
edf4daa7-93e0-4557-969b-fbc1d61fa9f1	f3f6271f-50d7-42b2-8a23-5d688fd0042d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 17:20:04.818146+00	\N	\N
63384c96-5778-415b-9149-733b203c5731	08bae2b8-58ae-46a3-a30e-aaae2c33c4ab	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 20:07:35.272316+00	sale	ba3b2d6a-eb75-4bf4-b6e4-91ee84502572
7a6a5a16-943a-4934-b39f-05fc6d6dfb98	3e68ec96-b5ed-4d7b-856b-570a51e12463	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 20:43:00.14328+00	\N	\N
c46f2655-aa58-44c9-8564-2ad383487796	3e68ec96-b5ed-4d7b-856b-570a51e12463	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	4800.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 20:48:05.879801+00	sale	26c73e6e-eb4f-4264-97dd-10112a497ee6
43dac234-a499-484b-afc3-9a0f132122d7	88b84530-e118-48a2-b54b-c60684c7b68d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 20:48:05.879801+00	sale	26c73e6e-eb4f-4264-97dd-10112a497ee6
6062c1cf-5f8f-4ba0-b945-0f7996188264	8d82cbd4-6995-46f4-9591-7968c4a572d4	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	90.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 20:48:05.879801+00	sale	26c73e6e-eb4f-4264-97dd-10112a497ee6
e80afe04-242b-4ec3-9dd8-fc4914f08c44	9ed1022c-9015-4165-aace-fbd3a371f5b9	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2300.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 20:48:05.879801+00	sale	26c73e6e-eb4f-4264-97dd-10112a497ee6
649630eb-3dd9-42f0-a4a8-72ba6680fc80	e20967e2-77a4-4bc5-9bb5-b45b65858df4	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	90.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 20:48:05.879801+00	sale	26c73e6e-eb4f-4264-97dd-10112a497ee6
eda5d702-60c9-4fdb-b8fc-8f1f2f221ce7	ec2ae3b7-98b2-4ad8-9b8b-7c6a359144c0	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	3400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 20:48:05.879801+00	sale	26c73e6e-eb4f-4264-97dd-10112a497ee6
2f7ed27c-6540-441b-ad3f-6f784ffd1142	e0fb09fc-c273-4d58-9423-87d353d807d1	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 09:43:45.756446+00	sale	09cbdb00-4ede-4859-94af-ef10a2d109b6
dc002c1a-93f9-4906-8580-5d69c780a464	08bae2b8-58ae-46a3-a30e-aaae2c33c4ab	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 14:18:55.646681+00	sale	79b7e6e0-3852-4ddd-b621-066c5e43453c
bd1928a8-47dc-47cc-8e64-2c47136d73da	11ed1686-50e2-4b62-83ea-3f9ec7be1324	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-22 15:11:58.051624+00	sale	c63b4728-ffc8-43aa-8a76-107d0ad0937e
a44d1455-8f8f-4af4-81c8-3797333323e3	c802adac-afc2-445b-9fdb-b02336c37644	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	8.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 15:14:09.218058+00	\N	\N
0d178d3b-f89f-4d41-b724-7b5243c79321	fc939814-0b00-4e41-bbb0-c8d2ca758359	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 15:15:40.982412+00	\N	\N
71b4cfcc-54a0-4e34-b88a-01be171c8477	4bc66865-1f22-4dd0-8cea-375f3088550d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 15:31:41.226889+00	\N	\N
7aa004c2-4e55-47c1-884f-19d8598f2af0	4333bfd6-0bd3-44cb-8eca-01c380e70a09	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 15:33:24.705048+00	sale	029552cf-ab19-431c-ae9d-e5c462b4372c
f75cce14-30be-40c4-b5bc-0dacff46f5f1	4bc66865-1f22-4dd0-8cea-375f3088550d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	500.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 15:33:24.705048+00	sale	029552cf-ab19-431c-ae9d-e5c462b4372c
a2354d18-7791-4162-9f10-d9482e58ee70	964387a5-0a14-450d-bcbf-a251477f441d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 15:33:24.705048+00	sale	029552cf-ab19-431c-ae9d-e5c462b4372c
348bba8b-b567-45c3-bf6e-87c667f3e7a3	17cb9df6-89f3-47f5-a2f6-c105aa579aae	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 16:25:11.797153+00	\N	\N
b6c2bd2c-c7fa-4f33-bf18-67cc920c7086	66658002-0da1-416c-bbcd-c6ce034ab1dd	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	4.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 16:26:37.791828+00	\N	\N
c74dcdbb-22ef-4d54-8da6-ba527cf98093	1ba1671c-a827-47b0-a2e5-5fd032ac2490	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 16:27:58.575772+00	\N	\N
b1e61cce-099c-4331-910d-60aed0e69b64	1ba1671c-a827-47b0-a2e5-5fd032ac2490	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 16:28:08.519627+00	\N	\N
ca64966e-ee42-4e54-a1ea-92829cf59407	4bc66865-1f22-4dd0-8cea-375f3088550d	f00a0950-fc40-4801-ab3e-f158fdd9e091	return_in	1.000	700.00	\N	Sales return	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:03:10.811537+00	sales_return	df478022-4ae2-442a-8027-d649683775f1
679724fd-bbc1-4791-8961-814e66619162	3ce5cd23-d98f-4ed1-aace-80348866b1b1	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:15:11.432954+00	\N	\N
a6e96b77-bf60-4f45-b97c-cc32d011c799	37b8b5ed-dc2f-416c-a614-df1b6ca4902f	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:15:17.269484+00	\N	\N
4faf024b-3e34-4e2e-8233-16c923de2fc8	87a70022-2358-43bf-be60-1fc57cbcd68d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:16:14.484815+00	\N	\N
41d51c99-402d-47be-bf19-16e749695c5a	d0ea5012-f420-479c-8d06-db8394b66e65	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:16:23.299437+00	\N	\N
49f768bb-ede9-427b-b500-3e344304afa2	6607f1cc-7507-4ae3-a658-7b421cad5ad2	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:18:35.438736+00	\N	\N
73f383c0-6419-40ec-a9d2-5c00440e0c9f	0c97bd4c-2abc-43db-bb30-d91bc3370e7c	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:27:30.661648+00	\N	\N
472d346a-ac01-4405-a44a-3fab0c0b148d	80e5f29e-e3ec-4293-bd3c-3a335ab2477d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	700.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:29:06.21963+00	sale	318ae0d4-7784-4bfa-bc71-6724175d7777
073cd198-2252-41f7-8606-047df4686a79	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:31:03.4268+00	sale	73f4e1c9-1121-487b-a2df-7f65d021182b
f4f8db24-ccfe-4350-b0ff-ab1a3e29cf8f	9fd7f5bf-be1a-45a5-8d4d-e520803d3d5d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:39:11.094069+00	\N	\N
c76121bf-3ace-42af-b34a-a5e22673ee01	6607f1cc-7507-4ae3-a658-7b421cad5ad2	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:40:24.360369+00	\N	\N
c466d6ed-0e26-498b-88bb-a2bcd026c8ea	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:49:52.193347+00	sale	59ba7786-c59b-4431-afed-5ce6f203e47f
cee212e5-0ff4-4730-8526-123b4833d1ab	9851c408-0596-48ea-8fc1-7bc214717a97	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 17:52:16.392618+00	\N	\N
5d9e14a1-27ee-4caa-9764-f1277f834047	8104da92-c9a7-4a6d-a5a3-89d03bfbd93c	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 18:00:52.027716+00	\N	\N
23abda3a-4e30-4f90-8a6b-e6ca491749fa	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 18:53:42.561866+00	sale	7123ae3c-082f-4341-afd1-ae7529e9287f
79801e1c-f9f5-4de8-9961-747a2fd5cfca	66658002-0da1-416c-bbcd-c6ce034ab1dd	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	2450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 18:58:28.907346+00	sale	3e10769d-911d-4655-87b9-bd2e2d8513d3
2344d847-6eed-4864-881c-d919a3c6964d	11ed1686-50e2-4b62-83ea-3f9ec7be1324	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 18:59:48.786358+00	sale	c20a66af-e213-46db-ad3a-b6e05e8b1122
f00fa050-29ab-4ce7-aa3e-1463b047abd2	c802adac-afc2-445b-9fdb-b02336c37644	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 18:59:48.786358+00	sale	c20a66af-e213-46db-ad3a-b6e05e8b1122
32e4a1ae-30ba-432f-91bc-5d5f1a7fd4df	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-26 18:59:48.786358+00	sale	c20a66af-e213-46db-ad3a-b6e05e8b1122
0f00b43a-d611-4475-b2ae-2147e2dd0542	7afca9de-fc1c-45dd-9d8f-39f5b1b76266	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 19:04:56.985442+00	\N	\N
61304610-d164-43ec-8e10-af8e6200ea4f	48c45a44-5f20-4fd7-bf80-95e427064b7b	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 19:05:10.58157+00	\N	\N
ac3e1c99-947a-4064-83ed-25444b8f8cbb	7afca9de-fc1c-45dd-9d8f-39f5b1b76266	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 19:09:41.483656+00	sale	0d4944a7-e624-43f3-b18f-2f39c4cde821
23d056db-0645-4036-b2fa-9d314086fd73	fa4db2cb-96ee-4b13-a939-fdebaf508553	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	90.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 19:09:41.483656+00	sale	0d4944a7-e624-43f3-b18f-2f39c4cde821
67810e55-e77f-4534-9564-85238c8ef188	aa31fd37-7e24-4c2d-9e48-3c0e4c989db5	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	7.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 19:36:05.093905+00	\N	\N
35d076cb-4223-4527-a4ce-9010f0ca7124	aa31fd37-7e24-4c2d-9e48-3c0e4c989db5	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	800.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 19:43:35.851785+00	sale	c2b6e55d-800b-4d16-9d93-3f5607322e6e
6cfc132c-2753-4bd5-946c-341168b67b72	1ca11cda-7ca7-46b4-9c9d-85bcb6bbfb58	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 19:44:56.931829+00	sale	25528fa8-5626-40bd-b4bf-1956bed54498
d8ba9cca-27bc-4987-830c-8c50a7610c3a	1ca11cda-7ca7-46b4-9c9d-85bcb6bbfb58	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-18 19:50:00.067983+00	sale	7ed64f6d-fe92-426f-a703-062fbad58129
9f11f231-ed5c-46f1-99f5-25bb697e7b91	1ca11cda-7ca7-46b4-9c9d-85bcb6bbfb58	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-13 19:50:15.242696+00	sale	7673095d-0a09-42be-af97-b4821bb0f9bc
bda0497a-669c-4573-af08-2d37893add3e	09d0d848-423d-426a-98a7-2c95e4738540	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 20:22:58.5971+00	sale	8a3b47e1-e835-41c8-9fc2-e6220b9b684d
77521448-c286-44c8-8764-204c235dbfb8	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 20:22:58.5971+00	sale	8a3b47e1-e835-41c8-9fc2-e6220b9b684d
19a10e4c-37fc-4b80-99d2-b50881036f77	28e27bd6-fa77-4fa4-b03e-e76abed1e884	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 21:02:30.232727+00	sale	8314365f-2c0e-4bb1-b35c-6013754d0e3c
434932a2-bcaa-4f4e-831d-e76d5ae748d9	80e5f29e-e3ec-4293-bd3c-3a335ab2477d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	700.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 22:02:16.37897+00	sale	fd7d4d6f-1b50-4bb4-9a65-1959f7a8a065
01a906c5-5569-4215-aded-2b4bca46e256	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 22:02:16.37897+00	sale	fd7d4d6f-1b50-4bb4-9a65-1959f7a8a065
cacdff2b-13ca-4d7c-8127-f393b4b726b6	341d5503-de65-4b36-96d6-7e18b0d72e20	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 22:26:16.923743+00	sale	39ce96b4-ec0b-43af-bbc9-ff514e7096d2
52603603-9165-424c-80ed-fb69325e635b	68530644-1472-4fa9-84c0-e82aa848ff0c	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 22:27:05.850219+00	sale	13d833bf-addd-431c-8af9-760bb0229f2f
dc71dd70-362e-45d7-8366-7c047308fb2d	050d2592-c49a-47fc-a43f-810632c9dac9	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1200.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-27 22:27:28.78832+00	sale	2b28aba0-a869-4942-883c-fc5fbb64fa74
93fd487c-dd4c-4f09-b3b9-5887dca3459b	9d116d69-0484-41d4-8b27-f169134c764d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 00:25:45.215053+00	\N	\N
84a96374-d0d3-429f-83f4-e96fdb5b230d	22f584dc-9914-48b1-98d2-2e7890e3fad2	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	1.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 00:26:06.344591+00	\N	\N
7859d973-faa0-4011-bbd4-c164f688ae80	22f584dc-9914-48b1-98d2-2e7890e3fad2	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 00:31:17.286378+00	sale	70b03851-5bcb-4462-bba1-201f5ff596f8
e69c3c85-451d-4fc9-815f-5d149210f2e9	2c94f75f-ef17-4da1-9a21-6c3c8324c620	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 00:31:17.286378+00	sale	70b03851-5bcb-4462-bba1-201f5ff596f8
eb30aefb-e28b-43ff-90b1-8f13ca50c106	9922e1aa-c67f-4007-a093-8528fd89e4f1	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1200.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 00:31:17.286378+00	sale	70b03851-5bcb-4462-bba1-201f5ff596f8
f3d38f96-3e68-451f-8813-3505a1bf7886	9d116d69-0484-41d4-8b27-f169134c764d	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 00:31:17.286378+00	sale	70b03851-5bcb-4462-bba1-201f5ff596f8
89539b0d-956e-40bb-97bc-2f3a7187130e	d3dd2adc-6df9-47f0-86af-1b868070f219	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	950.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 00:31:17.286378+00	sale	70b03851-5bcb-4462-bba1-201f5ff596f8
03b7d0bf-2ed0-445b-9cc9-ec001caa7386	fb1df70f-6f73-40fe-89fa-bea2be5c2d87	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	450.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 00:31:17.286378+00	sale	70b03851-5bcb-4462-bba1-201f5ff596f8
d11ece03-af25-42fd-8f33-354ebdbe35a3	08bae2b8-58ae-46a3-a30e-aaae2c33c4ab	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 13:12:28.818171+00	sale	75e359bf-4c3a-4b09-9f50-0d3c1181bc5e
b64adb93-dbac-4716-8a93-a08d1e17eccc	bd9ec08a-349d-44c6-9252-ad448e76ce8b	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	2.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 13:35:00.797954+00	\N	\N
372322f5-9b06-48ce-9c93-64ac0819163f	bd9ec08a-349d-44c6-9252-ad448e76ce8b	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	1400.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 13:35:13.392158+00	sale	4c1899ec-0474-46d0-8ae7-efc9b0310ac1
b22f34ca-259a-4346-9e3e-9dfdd37a76f5	17cb9df6-89f3-47f5-a2f6-c105aa579aae	f00a0950-fc40-4801-ab3e-f158fdd9e091	sale	1.000	4900.00	\N	POS sale	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 14:56:55.615501+00	sale	ba3878af-0166-4cf5-9621-754aeb74773b
dfabe113-524b-478b-bf33-920b64091617	3c707e7f-c6ac-4493-a5ac-1a4b2663ca7d	f00a0950-fc40-4801-ab3e-f158fdd9e091	adjustment	10.000	0.00	\N	\N	a9d8394f-8572-40f2-baaf-78e63e4ba571	2026-09-28 17:37:43.387262+00	\N	\N
\.


--
-- Data for Name: stock_transfers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."stock_transfers" ("id", "transfer_number", "from_warehouse_id", "to_warehouse_id", "status", "note", "created_by", "created_at") FROM stdin;
\.


--
-- Data for Name: stock_transfer_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."stock_transfer_items" ("id", "transfer_id", "product_id", "quantity") FROM stdin;
\.


--
-- Data for Name: tenant_subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."tenant_subscriptions" ("id", "tenant_id", "plan_id", "extra_modules", "disabled_modules", "status", "started_at", "expires_at", "created_at", "updated_at") FROM stdin;
34534eb9-97b8-42f2-aae4-7876d0c12e1d	default	enterprise	{}	{}	active	2026-09-15 19:53:03.494041+00	\N	2026-09-15 19:53:03.494041+00	2026-09-15 19:53:03.494041+00
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."user_roles" ("id", "user_id", "role", "created_at") FROM stdin;
ba33b5be-c4c0-428a-be66-18ff684c33f1	7ae4823c-0946-4765-96f9-881dbf42b316	owner	2026-09-13 18:40:13.053971+00
b0e47ae6-bd9d-4e7e-8b66-0953ae19bca7	ef8142de-d644-4bd6-aa37-5613b041e0ad	owner	2026-09-16 00:19:56.217835+00
3a6593f8-bc65-42d5-829f-4f1029558644	a9d8394f-8572-40f2-baaf-78e63e4ba571	manager	2026-09-16 00:47:56.152408+00
\.


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type", "versioning_status", "lifecycle_configuration", "lifecycle_configuration_generation") FROM stdin;
\.


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."buckets_analytics" ("name", "type", "format", "created_at", "updated_at", "id", "deleted_at") FROM stdin;
\.


--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."buckets_vectors" ("id", "type", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."objects" ("id", "bucket_id", "name", "owner", "created_at", "updated_at", "last_accessed_at", "metadata", "version", "owner_id", "user_metadata", "archived_at", "is_delete_marker", "is_versioned") FROM stdin;
\.


--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."s3_multipart_uploads" ("id", "in_progress_size", "upload_signature", "bucket_id", "key", "version", "owner_id", "created_at", "user_metadata", "metadata") FROM stdin;
\.


--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."s3_multipart_uploads_parts" ("id", "upload_id", "size", "part_number", "bucket_id", "key", "etag", "owner_id", "version", "created_at") FROM stdin;
\.


--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."vector_indexes" ("id", "name", "bucket_id", "data_type", "dimension", "distance_metric", "metadata_configuration", "created_at", "updated_at") FROM stdin;
\.


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 354, true);


--
-- Name: purchase_invoice_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."purchase_invoice_seq"', 8, true);


--
-- Name: purchase_return_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."purchase_return_seq"', 3, true);


--
-- Name: sales_invoice_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."sales_invoice_seq"', 114, true);


--
-- Name: sales_return_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."sales_return_seq"', 11, true);


--
-- Name: stock_transfer_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."stock_transfer_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

-- \unrestrict lDKvtWIrZSW5rCu1TuvMYeBcv0MHJdOZkzdNIOPjuYn8egBtmrtcxgTKimwzqUj

RESET ALL;
