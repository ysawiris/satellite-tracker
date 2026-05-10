import requests
from requests.exceptions import HTTPError

try:
    response = requests.get(
        'https://www.fire.ca.gov/umbraco/api/IncidentApi/List?inactive=true')
    response.raise_for_status()
    # access JSOn content
    jsonResponse = response.json()
    # print("Entire JSON response")
    # print(jsonResponse)


except HTTPError as http_err:
    print(f'HTTP error occurred: {http_err}')
except Exception as err:
    print(f'Other error occurred: {err}')

for f in jsonResponse:
    if isinstance(f['Longitude'], ):
        print(f['Longitude'])
