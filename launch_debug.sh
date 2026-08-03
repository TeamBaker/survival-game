#!/bin/bash
cd /home/imebored/engine3d
/home/imebored/.hermes/hermes-agent/venv/bin/python3 engine.py 2>&1 | tee /tmp/engine_debug.log
