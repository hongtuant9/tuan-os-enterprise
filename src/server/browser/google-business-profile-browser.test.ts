import test from "node:test";
import assert from "node:assert/strict";
import { detectGoogleBusinessProfileState } from "./google-business-profile-browser.ts";

test("detects login",()=>assert.equal(detectGoogleBusinessProfileState("https://accounts.google.com/signin","Sign in"),"HOLD_LOGIN"));
test("detects MFA",()=>assert.equal(detectGoogleBusinessProfileState("https://accounts.google.com/challenge","2-Step Verification enter code"),"HOLD_MFA"));
test("detects captcha",()=>assert.equal(detectGoogleBusinessProfileState("https://accounts.google.com/","Confirm you're not a robot"),"HOLD_CAPTCHA"));
test("detects authenticated business profile",()=>assert.equal(detectGoogleBusinessProfileState("https://business.google.com/locations","Your business on Google"),"READY"));

test("detects account chooser",()=>assert.equal(detectGoogleBusinessProfileState("https://accounts.google.com/v3/signin/accountchooser","Choose an account"),"HOLD_ACCOUNT_SELECTION"));
