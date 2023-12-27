#!/usr/bin/env python

import argparse
import datetime
import os

import dateutil.parser
import httplib2
from apiclient import discovery
from oauth2client import client, tools
from oauth2client.file import Storage

_CALENDAR_ID = "054fnj32ov0fit62sam8ss7pcg@group.calendar.google.com"

# If modifying these scopes, delete your previously saved credentials
# at ~/.credentials/calendar-python-quickstart.json
SCOPES = "https://www.googleapis.com/auth/calendar.readonly"
CLIENT_SECRET_FILE = "client_secret.json"
APPLICATION_NAME = "Google Calendar API Python Quickstart"


def get_credentials(flags):
    """Gets valid user credentials from storage.

    If nothing has been stored, or if the stored credentials are invalid,
    the OAuth2 flow is completed to obtain the new credentials.

    Returns:
        Credentials, the obtained credential.
    """
    home_dir = os.path.expanduser("~")
    credential_dir = os.path.join(home_dir, ".credentials")
    if not os.path.exists(credential_dir):
        os.makedirs(credential_dir)
    credential_path = os.path.join(credential_dir, "calendar-python-quickstart.json")

    store = Storage(credential_path)
    credentials = store.get()
    if not credentials or credentials.invalid:
        flow = client.flow_from_clientsecrets(CLIENT_SECRET_FILE, SCOPES)
        flow.user_agent = APPLICATION_NAME
        credentials = tools.run_flow(flow, store, flags)
        print("Storing credentials to " + credential_path)
    return credentials


def main():
    """Get events from the NorCal SKA calendar."""

    parser = argparse.ArgumentParser(
        parents=[tools.argparser],
        description="""
Get events from the NorCal SKA calendar in the week following from
now.
""",
    )
    parser.add_argument(
        "--next-month",
        "-n",
        action="store_true",
        help="Show events in the month after the current month",
        dest="next_month",
    )
    parser.add_argument(
        "--this-month",
        "-t",
        action="store_true",
        help="Show events in the month after the current month",
        dest="this_month",
    )
    args = parser.parse_args()

    credentials = get_credentials(args)
    http = credentials.authorize(httplib2.Http(".cache", disable_ssl_certificate_validation=False))
    service = discovery.build("calendar", "v3", http=http)

    now = datetime.datetime.utcnow()
    then = now + datetime.timedelta(weeks=1)
    if args.next_month:
        month = (now.month % 12) + 1
        year = now.year + (1 if month == 1 else 0)
        now = datetime.datetime(year=year, month=month, day=1)
        then = now + datetime.timedelta(days=31)
    elif args.this_month:
        now = datetime.datetime(year=now.year, month=now.month, day=1)
        then = now + datetime.timedelta(days=31)

    eventsResult = (
        service.events()
        .list(
            calendarId=_CALENDAR_ID,
            timeMin=now.isoformat() + "Z",  # 'Z' indicates UTC time
            timeMax=then.isoformat() + "Z",
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )
    events = eventsResult.get("items", [])

    if not events:
        print("No upcoming events found.")
    for event in events:
        start = dateutil.parser.parse(event["start"].get("dateTime", event["start"].get("date")))
        end = dateutil.parser.parse(event["end"].get("dateTime", event["end"].get("date")))
        print(event["summary"])
        print(start.strftime("%a %b %d, %Y"))
        print(start.strftime("%I:%M%p"), "-", end.strftime("%I:%M%p"))
        if "location" in event:
            print(event["location"])
        if "description" in event:
            print(event["description"])
        print("")

    print(
        """Regards,

Theodore Wong <tmw@tmwong.org>
El Camino SKA Dojo"""
    )


if __name__ == "__main__":
    main()
