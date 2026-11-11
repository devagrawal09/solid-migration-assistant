import { A, Route, Router, action, cache, createAsync, revalidate, useNavigate, useParams } from "@solidjs/router";
import { MetaProvider, Title, useHead } from "@solidjs/meta";
import { clientOnly } from "@solidjs/start";
import { FileRoutes } from "@solidjs/start/router";
import { someOtherHelper } from "@solidjs/start/server";
import { getCookie, setCookie } from "vinxi/http";
import { A as LocalA } from "./components";

export const app = { A, Route, Router, action, cache, createAsync, revalidate, useNavigate, useParams, MetaProvider, Title, useHead, clientOnly, FileRoutes, someOtherHelper, getCookie, setCookie, LocalA };
