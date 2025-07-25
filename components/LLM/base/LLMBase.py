"""
LLMBase module.

This module defines the LLMBase class, which serves as a statically typed
base class for Large Language Model (LLM) implementations. Subclasses should
implement the abstract methods to provide specific LLM functionalities.
"""

from abc import ABC
import logging
from typing import Optional, List
from pydantic import BaseModel, Field
from pydantic import model_validator


class LLMConfigBase(BaseModel):
    pass


class LLMBase(BaseModel, ABC):
    """
    Abstract base class for Large Language Models (LLMs).

    Provides a standardized interface for LLM implementations.

    Attributes:
        model (str): The name or identifier of the LLM.
        config (LLMConfigBase): Optional configuration parameters for the LLM.
        system_prompt (Optional[str]): Optional system prompt to guide the LLM's behavior.
        api_key (Optional[str]): Optional API key for authenticating with the LLM provider.

    Class Attributes:
        _models (List[str]): List of all available models for the LLM. Subclasses should override this.

    Methods:
        get_models() -> List[str]:
            Returns a list of all available models for this LLM.

    Raises:
        AttributeError: If attempting to access the 'models' property directly.
        ValueError: If the specified model is not in the list of available models.
    """

    model: str = Field(..., description="The name or identifier of the LLM.")

    config: LLMConfigBase = Field(
        default_factory=LLMConfigBase, description="Optional configuration parameters."
    )
    system_prompt: Optional[str] = Field(
        default=None, description="Optional system prompt for the LLM."
    )
    api_key: Optional[str] = Field(
        default=None, description="Optional API key for authentication."
    )

    logger: Optional[logging.Logger] = Field(
        None, description="Optional logger for logging messages."
    )

    # List of all available models for the LLM. Subclasses should override this.
    # Private class variable to store available models. Access via get_models().
    _models: List[str] = []

    class Config:
        arbitrary_types_allowed = True
        extra = "allow"

    @property
    def models(self):
        raise AttributeError(
            "Use the get_models() class method to access available models."
        )

    def log(self, message: str, level: int = logging.INFO):
        """
        Logs a message using the provided logger if available, otherwise prints to stdout.
        """
        if self.logger:
            self.logger.log(level, message)
        else:
            print(f"[{logging.getLevelName(level)}] {message}")

    def get_models(cls) -> List[str]:
        """
        Return a list of all available models for this LLM.

        Returns:
            list: A list of model names or identifiers.
        """
        return cls._models

    @model_validator(mode="after")
    def validate_model_in_models(self):
        if self.model not in self._models:
            raise ValueError(
                f"Model '{self.model}' is not in the list of available models: {self._models}"
            )
        return self

    def __call__(self, *args, **kwargs):
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement the '__call__' method."
        )
