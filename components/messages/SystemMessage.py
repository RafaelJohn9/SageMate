from components.messages.base.MessageBase import MessageBase


class SystemMessage(MessageBase):
    """
    System message for priming AI behavior.

    The system message is usually passed in as the first of a sequence
    of input messages.
    """

    role: str = "system"
