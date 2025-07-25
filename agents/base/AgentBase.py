"""
This module defines the base class for agents in the SageMate framework.
It provides a structure for agents to interact with language models and includes
configuration options, logging capabilities, and a method for retrieving LLM configurations.
"""

from typing import Optional
from pydantic import BaseModel, Field
from components.LLM.base.LLMBase import LLMBase
import logging


class AgentBase(BaseModel):
    """
    AgentBase provides a standardized interface for agents that interact with language models (LLMs).

    Attributes:
        SystemPrompt (Optional[str]): System prompt to guide the LLM's behavior.
        llm (LLMBase): The language model instance that the agent will interact with.
        logger (Optional[logging.Logger]): Logger instance for logging messages.

    Methods:
        log(message: str, level: int = logging.INFO):
            Logs a message using the provided logger, or prints to stdout if no logger is set.
        run(*args, **kwargs):
            Main agent execution logic. Must be implemented by subclasses.
    """

    SystemPrompt: Optional[str] = Field(
        None, description="System prompt to guide the LLM's behavior."
    )
    llm: LLMBase = Field(
        ...,
        description="The language model instance that the agent will interact with.",
    )

    logger: Optional[logging.Logger] = Field(
        None, description="Optional logger for logging messages."
    )

    class Config:
        arbitrary_types_allowed = True
        extra = "allow"

    def log(self, message: str, level: int = logging.INFO):
        """
        Logs a message using the provided logger if available, otherwise prints to stdout.
        """
        if self.logger:
            self.logger.log(level, message)
        else:
            print(f"[{logging.getLevelName(level)}] {message}")
