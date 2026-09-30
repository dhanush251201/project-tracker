#!/usr/bin/env node
// The entry point for `npm start` and for pm2.
//
// It exists because pm2 loads a script through its own wrapper rather than as
// the process entry point, so a module that only listens when it detects it is
// "main" would start silently doing nothing under pm2. This file has no such
// condition: importing it starts the server, full stop.
import { startServer } from '../server.js';

startServer();
